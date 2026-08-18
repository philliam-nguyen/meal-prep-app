// One throwaway Postgres for the whole run (ADR-0005). Migrations are applied as the owner role,
// the restricted role the API connects as is created there too, and tests are handed only the
// restricted connection string. So the suite proves the migrations apply from empty and that the
// API's grants are sufficient by booting at all, rather than by tests somebody remembers to write.
//
// The boot itself moved to src/throwawayPostgres.js when the Seed recording needed the same
// database. What is left here is the suite's half: which connection string the tests are handed.

import { startThrowawayPostgres } from '../src/throwawayPostgres.js';

let postgres;

export async function globalSetup() {
  postgres = await startThrowawayPostgres();

  process.env.TEST_OWNER_DATABASE_URL = postgres.ownerUrl;
  process.env.TEST_APP_DATABASE_URL = postgres.appUrl;
  process.env.TEST_APP_ROLE = postgres.appRole;
}

export async function globalTeardown() {
  await postgres?.stop();
}
