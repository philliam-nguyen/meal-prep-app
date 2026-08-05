// Connections into the fixture's Postgres. Tests reach the database as the restricted role, the
// same one the API uses; only truncation between tests runs as the owner, because the restricted
// role deliberately has no TRUNCATE privilege.

import pg from 'pg';

function requireUrl(name) {
  const url = process.env[name];
  if (!url) {
    throw new Error(`${name} is not set. Run the suite through "npm test" so global setup runs.`);
  }
  return url;
}

export const appDatabaseUrl = () => requireUrl('TEST_APP_DATABASE_URL');
export const ownerDatabaseUrl = () => requireUrl('TEST_OWNER_DATABASE_URL');
export const appRole = () => requireUrl('TEST_APP_ROLE');

/** A client connected as the restricted role, closed when the test ends. */
export async function connect(t) {
  const client = new pg.Client({ connectionString: appDatabaseUrl() });
  await client.connect();
  t.after(() => client.end());
  return client;
}

/** Empties every domain table, leaving migration bookkeeping alone. Runs as the owner. */
export async function truncateAllTables() {
  const client = new pg.Client({ connectionString: ownerDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query(`
      select quote_ident(tablename) as ident
      from pg_tables
      where schemaname = 'public' and tablename <> 'schema_migrations'
    `);
    if (rows.length === 0) return;
    const tables = rows.map((row) => row.ident).join(', ');
    await client.query(`truncate table ${tables} restart identity cascade`);
  } finally {
    await client.end();
  }
}
