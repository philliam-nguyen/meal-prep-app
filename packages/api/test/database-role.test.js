// ADR-0001 requires the application's database role to be stripped of ownership and DDL rights, so
// that injection has no reachable consequence. This is the one file that talks to Postgres instead
// of to the API, because no endpoint could ever be asked to run DDL, and a privilege that only
// prose claims to have removed is a privilege nobody has checked.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appRole, connect } from './helpers/database.js';

const INSUFFICIENT_PRIVILEGE = '42501';

async function refused(client, sql) {
  const error = await client.query(sql).then(
    () => null,
    (rejection) => rejection,
  );
  assert.ok(error, `expected "${sql}" to be refused`);
  return error;
}

test('the API role cannot create a table', async (t) => {
  const client = await connect(t);

  const error = await refused(client, 'create table injected (id integer)');

  assert.equal(error.code, INSUFFICIENT_PRIVILEGE);
});

test('the API role cannot alter a table', async (t) => {
  const client = await connect(t);

  const error = await refused(client, 'alter table schema_migrations add column injected integer');

  assert.equal(error.code, INSUFFICIENT_PRIVILEGE);
});

test('the API role cannot drop a table', async (t) => {
  const client = await connect(t);

  const error = await refused(client, 'drop table schema_migrations');

  assert.equal(error.code, INSUFFICIENT_PRIVILEGE);
});

test('the API role cannot route around the schema by creating one', async (t) => {
  const client = await connect(t);

  const error = await refused(client, 'create schema injected');

  assert.equal(error.code, INSUFFICIENT_PRIVILEGE);
});

test('the API role cannot reach migration bookkeeping at all', async (t) => {
  const client = await connect(t);

  const read = await refused(client, 'select * from schema_migrations');
  const write = await refused(client, 'delete from schema_migrations');

  assert.equal(read.code, INSUFFICIENT_PRIVILEGE);
  assert.equal(write.code, INSUFFICIENT_PRIVILEGE);
});

test('the API role owns nothing and holds no superuser or role-creation rights', async (t) => {
  const client = await connect(t);

  const { rows } = await client.query(
    'select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = $1',
    [appRole()],
  );
  const { rows: owned } = await client.query(
    'select tablename from pg_tables where schemaname = $1 and tableowner = $2',
    ['public', appRole()],
  );

  assert.deepEqual(rows, [
    { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false },
  ]);
  assert.deepEqual(owned, []);
});
