// Connections into the fixture's Postgres. Tests reach the database as the restricted role, the
// same one the API uses; only truncation between tests runs as the owner, because the restricted
// role deliberately has no TRUNCATE privilege.

import pg from 'pg';
import { emptyDatabase } from '../../src/seeding.js';

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

/**
 * A client connected as the owner role, closed when the test ends. Only for the things the app role
 * is deliberately not allowed to do: it holds `usage, select` on the sequences, which mints ids but
 * cannot move one. The operator's extract moves them, which is the case these tests set up.
 */
export async function connectAsOwner(t) {
  const client = new pg.Client({ connectionString: ownerDatabaseUrl() });
  await client.connect();
  t.after(() => client.end());
  return client;
}

/**
 * Empties every domain table, leaving migration bookkeeping alone. Runs as the owner.
 *
 * Through the restore's own function rather than a statement of its own, so the database a test
 * starts from is the database a restore leaves behind, by construction rather than by two
 * definitions of "domain table" that happen to agree today.
 */
export async function truncateAllTables() {
  const client = new pg.Client({ connectionString: ownerDatabaseUrl() });
  await client.connect();
  try {
    await emptyDatabase(client);
  } finally {
    await client.end();
  }
}
