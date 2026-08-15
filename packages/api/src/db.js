import pg from 'pg';

/**
 * A pool for one of this project's commands. Every query the API runs goes through here as the
 * restricted role, and so does every query the Seed restore runs as the owner role.
 *
 * That second caller is why the name is a parameter rather than a constant. Two commands connecting
 * as different roles appearing under one name in pg_stat_activity is a lie an operator only catches
 * after chasing it, and the restore's log is the only other account of what it did.
 */
export function createPool(connectionString, applicationName = 'meal-prep-api') {
  if (!connectionString) throw new Error('a connection string is required');

  return new pg.Pool({
    connectionString,
    application_name: applicationName,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
