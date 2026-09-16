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

// The other half of "from empty" for the migration that points the Ingredient at an Aisle row
// instead of typing one: a deployment already holding Ingredients with free-text Aisles has to
// take this migration too, and what it leaves behind is what matters.
const AISLE_REFERENCE_MIGRATION = '0007_ingredient_aisle_reference.sql';

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

/** A directory holding every migration but the newest, cleaned up when the test ends. */
async function everyMigrationBeforeTheNewest(t) {
  const filenames = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const dir = await mkdtemp(join(tmpdir(), 'migration-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  for (const filename of filenames.slice(0, -1)) {
    await copyFile(join(migrationsDir, filename), join(dir, filename));
  }
  return { dir, newest: filenames.at(-1) };
}

// The other half of "from empty": a deployment that is already running applies only what it has not
// seen, onto the schema the migrations before it left. The test above proves a fresh database
// reaches the current schema; this proves the newest migration is one an existing database can take,
// which is what every homelab restart and every Demo restore actually does.
test('the newest migration applies to a database holding the one before it', async (t) => {
  const client = await emptyDatabase(t);
  const { dir, newest } = await everyMigrationBeforeTheNewest(t);
  const history = await runMigrations({ client, dir });
  assert.ok(!history.applied.includes(newest), `${newest} was not held back`);

  const result = await runMigrations({ client, dir: migrationsDir });

  assert.deepEqual(result.applied, [newest]);
  assert.deepEqual(result.alreadyApplied, history.applied);
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


// Applying from empty is only half of what a migration has to do. The other half is the homelab
// instance on the morning it lands: a database at the previous schema with a cook's Recipes already
// in it. A column added not null needs a default every existing row can take, and a check
// constraint added to a populated table has to be one every existing row already satisfies.
test('the Batch column arrives on a database that already holds Recipes', async (t) => {
  const client = await emptyDatabase(t);
  const { dir } = await migrationsBefore(t, '0006_recipe_batch.sql');
  await runMigrations({ client, dir });
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

// The homelab morning this one has to survive: a database already holding Ingredients with a
// free-text Aisle typed into them. The migration drops that text rather than converting it, so what
// this proves is that the drop leaves the new reference column behind rather than failing outright.
test('an Ingredient with a free-text Aisle takes the reference migration onto an empty Aisle', async (t) => {
  const client = await emptyDatabase(t);
  const { dir } = await migrationsBefore(t, AISLE_REFERENCE_MIGRATION);
  await runMigrations({ client, dir });
  const { rows: before } = await client.query(
    "insert into ingredients (name, aisle) values ('Salt', 'Herbs & spices') returning id",
  );

  const { applied } = await runMigrations({ client, dir: migrationsDir });

  assert.ok(
    applied.includes(AISLE_REFERENCE_MIGRATION),
    `expected ${AISLE_REFERENCE_MIGRATION} to apply onto the prior schema, applied ${applied.join(', ')}`,
  );
  const { rows: columns } = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'ingredients' and column_name in ('aisle', 'aisle_id')`,
  );
  assert.deepEqual(
    columns.map((row) => row.column_name).sort(),
    ['aisle_id'],
    'the free-text column survived, or the reference column never arrived',
  );
  const { rows } = await client.query('select aisle_id from ingredients where id = $1', [
    before[0].id,
  ]);
  assert.deepEqual(rows, [{ aisle_id: null }], 'a free-text Aisle came across as a reference');
});

test('an Ingredient loses its Aisle when the Aisle it was filed under is removed', async (t) => {
  const client = await emptyDatabase(t);
  await runMigrations({ client, dir: migrationsDir });
  const { rows: aisle } = await client.query(
    "insert into aisles (name, position) values ('Produce', 1) returning id",
  );
  const { rows: ingredient } = await client.query(
    'insert into ingredients (name, aisle_id) values ($1, $2) returning id',
    ['Onion', aisle[0].id],
  );

  await client.query('delete from aisles where id = $1', [aisle[0].id]);

  const { rows } = await client.query('select aisle_id from ingredients where id = $1', [
    ingredient[0].id,
  ]);
  assert.deepEqual(rows, [{ aisle_id: null }], 'the Ingredient still names the deleted Aisle');
});

test('Aisles gain a Protected mark on top of the schema that came before it', async (t) => {
  const client = await emptyDatabase(t);
  const { dir } = await migrationsBefore(t, AISLE_REFERENCE_MIGRATION);
  await runMigrations({ client, dir });
  const { rows: before } = await client.query(
    "insert into aisles (name, position) values ('Produce', 1) returning id",
  );

  await runMigrations({ client, dir: migrationsDir });

  const { rows } = await client.query('select protected from aisles where id = $1', [
    before[0].id,
  ]);
  assert.deepEqual(rows, [{ protected: false }], 'an Aisle from before the migration is Protected');
});
