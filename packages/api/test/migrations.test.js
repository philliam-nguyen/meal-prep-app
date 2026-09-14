// Migrations run against a database of their own rather than the fixture's, so they can start from
// empty. The fixture's database has already been migrated by the time any test runs.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import { migrationsDir } from '../src/config.js';
import { runMigrations } from '../src/migrations.js';
import { ownerDatabaseUrl } from './helpers/database.js';

// Applying from empty is the other half of this: every deployment that already exists is on the
// schema as it stood before, and a migration that only works on a fresh database is one nobody can
// deploy. So the Aisle table is asked for twice - once at the end of a run from nothing, and once
// on top of the schema the previous migration left.
const AISLES_MIGRATION = '0004_aisles.sql';

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
 * A directory holding the migrations that come before `upTo`, so a database can be brought to the
 * schema as it stood before that file and the file can then be applied onto it. Filename order is
 * the order the runner applies in, which is what makes "before" a string comparison.
 */
async function migrationsBefore(t, upTo) {
  const dir = await mkdtemp(join(tmpdir(), 'meal-prep-migrations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const filenames = (await readdir(migrationsDir)).filter((name) => name < upTo).sort();
  for (const filename of filenames) {
    await copyFile(join(migrationsDir, filename), join(dir, filename));
  }
  return { dir, filenames };
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

test('the Aisle table arrives on top of the schema that came before it', async (t) => {
  const client = await emptyDatabase(t);
  const { dir, filenames } = await migrationsBefore(t, AISLES_MIGRATION);
  const before = await runMigrations({ client, dir });
  assert.deepEqual(before.applied, filenames);

  const { applied } = await runMigrations({ client, dir: migrationsDir });

  assert.ok(
    applied.includes(AISLES_MIGRATION),
    `expected ${AISLES_MIGRATION} to apply onto the prior schema, applied ${applied.join(', ')}`,
  );
  const { rows } = await client.query('select to_regclass($1) as table', ['public.aisles']);
  assert.equal(rows[0].table, 'aisles');
});

