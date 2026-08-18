// Running the restore the way the scheduled task runs it, minus the process boundary: as the owner
// role, because it truncates before it loads and the restricted role has no TRUNCATE grant.
//
// Guardrails come from the suite's own set rather than from the deployment's, for the reason
// helpers/app.js gives: a test that is not about a limit should not be able to trip one.

import { createPool } from '../../src/db.js';
import { recordSeed } from '../../src/recording.js';
import { restoreSeed } from '../../src/seeding.js';
import { TEST_GUARDRAILS } from './app.js';
import { ownerDatabaseUrl } from './database.js';

/** Loads the Seed into the fixture's database, and reports what it wrote. */
export async function loadSeed(t, { guardrails, fixture } = {}) {
  const pool = createPool(ownerDatabaseUrl(), 'meal-prep-seed');
  t.after(() => pool.end());

  return restoreSeed({ pool, fixture, guardrails: { ...TEST_GUARDRAILS, ...guardrails } });
}

/**
 * Records the Seed against the fixture's database, the way the build step records it against a
 * database of its own. The build starts a container for this and the suite already has one, which is
 * the whole reason the boot lives in src/throwawayPostgres.js rather than in the suite.
 */
export async function recordTheSeed(t, { guardrails } = {}) {
  const pool = createPool(ownerDatabaseUrl(), 'meal-prep-record');
  t.after(() => pool.end());

  return recordSeed({ pool, guardrails: { ...TEST_GUARDRAILS, ...guardrails } });
}
