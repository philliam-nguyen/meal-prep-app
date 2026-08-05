import pg from 'pg';

/** A pool for the restricted role. Every query the API runs goes through here. */
export function createPool(connectionString) {
  if (!connectionString) throw new Error('a connection string is required');

  return new pg.Pool({
    connectionString,
    application_name: 'meal-prep-api',
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
