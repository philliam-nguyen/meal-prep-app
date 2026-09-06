// Migrations run against a database of their own rather than the fixture's, so they can start from
// empty. The fixture's database has already been migrated by the time any test runs.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import { migrationsDir } from '../src/config.js';
import { runMigrations } from '../src/migrations.js';
import { ownerDatabaseUrl } from './helpers/database.js';

/** An empty database owned by the migration role, dropped when the test ends. */
async function emptyDatabase(t) {
  const name = `migration_probe_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ownerDatabaseUrl() });
  await admin.connect();
  await admin.query(`create database ${pg.escapeIdentifier(name)}`);

  const url = new URL(ownerDatabaseUrl());
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();

  // One hook, so the probe connection is always closed before the database goes.
  t.after(async () => {
    await client.end();
    await admin.query(`drop database ${pg.escapeIdentifier(name)} with (force)`);
    await admin.end();
  });

  return client;
}

/**
 * A directory holding the migrations that come before `filename`, so a test can stand a database up
 * at the schema as it was before one of them landed. Copies rather than reaches into the real
 * directory, because the runner applies everything it finds there.
 */
async function migrationsBefore(t, filename) {
  const dir = await mkdtemp(join(tmpdir(), 'meal-prep-migrations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  for (const name of await readdir(migrationsDir)) {
    if (name.endsWith('.sql') && name < filename) await cp(join(migrationsDir, name), join(dir, name));
  }

  return dir;
}

test('migrations apply from empty to current', async (t) => {
  const client = await emptyDatabase(t);

  const result = await runMigrations({ client, dir: migrationsDir });

  assert.ok(result.applied.length > 0, 'expected at least one migration to apply');
  const { rows } = await client.query('select filename from schema_migrations order by filename');
  assert.deepEqual(
    rows.map((row) => row.filename),
    result.applied,
  );
});

test('a second run is a no-op', async (t) => {
  const client = await emptyDatabase(t);
  const first = await runMigrations({ client, dir: migrationsDir });

  const second = await runMigrations({ client, dir: migrationsDir });

  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.alreadyApplied, first.applied);
});

test('a migration edited after it was applied fails loudly', async (t) => {
  const client = await emptyDatabase(t);
  const { applied } = await runMigrations({ client, dir: migrationsDir });
  await client.query('update schema_migrations set checksum = $1 where filename = $2', [
    'not-the-checksum-on-disk',
    applied[0],
  ]);

  await assert.rejects(() => runMigrations({ client, dir: migrationsDir }), /changed after it was applied/);
});

// Applying from empty is only half of what a migration has to do. The other half is the homelab
// instance on the morning it lands: a database at the previous schema with a cook's Recipes already
// in it. A column added not null needs a default every existing row can take, and a check
// constraint added to a populated table has to be one every existing row already satisfies.
test('the Batch column arrives on a database that already holds Recipes', async (t) => {
  const client = await emptyDatabase(t);
  await runMigrations({ client, dir: await migrationsBefore(t, '0006_recipe_batch.sql') });
  const { rows: before } = await client.query(
    "insert into recipes (name, type) values ('Minestrone', 'Soup') returning id",
  );

  await runMigrations({ client, dir: migrationsDir });

  const { rows } = await client.query('select batch from recipes where id = $1', [before[0].id]);
  assert.deepEqual(rows, [{ batch: 1 }], 'a Recipe from before the migration is not made once');
  // The range is the column's own rule and not only the route's, so a write that never went through
  // the API cannot make the Shopping List multiply by something nobody could have asked for.
  await assert.rejects(
    () => client.query('update recipes set batch = 0'),
    /recipes_batch_range/,
    'the column took a Batch of 0',
  );
  await assert.rejects(() => client.query('update recipes set batch = 10'), /recipes_batch_range/);
});
