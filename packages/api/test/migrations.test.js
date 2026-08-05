// Migrations run against a database of their own rather than the fixture's, so they can start from
// empty. The fixture's database has already been migrated by the time any test runs.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
