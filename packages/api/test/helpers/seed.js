// Running the restore the way the scheduled task runs it, minus the process boundary: as the owner
// role, because it truncates before it loads and the restricted role has no TRUNCATE grant.
//
// Guardrails come from the suite's own set rather than from the deployment's, for the reason
// helpers/app.js gives: a test that is not about a limit should not be able to trip one.

import { createPool } from '../../src/db.js';
import { restoreSeed } from '../../src/seeding.js';
import { TEST_GUARDRAILS } from './app.js';
import { ownerDatabaseUrl } from './database.js';

/** Loads the Seed into the fixture's database, and reports what it wrote. */
export async function loadSeed(t, { guardrails, fixture } = {}) {
  const pool = createPool(ownerDatabaseUrl());
  t.after(() => pool.end());

  return restoreSeed({ pool, fixture, guardrails: { ...TEST_GUARDRAILS, ...guardrails } });
}
