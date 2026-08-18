// The seam every test after this one uses: an app wired to the real Postgres as the restricted
// role, driven through Fastify's inject (ADR-0005). No mocks, no bound socket.

import { buildApp } from '../../src/app.js';
import { createPool } from '../../src/db.js';
import { appDatabaseUrl, truncateAllTables } from './database.js';

// Guardrail limits are configuration, so a test that is not about them passes values loose enough
// to stay out of the way, and a test that is about one passes its own. Deliberately not the
// deployed defaults: a suite that tripped a real limit by accident would be asserting on a number
// nobody chose.
export const TEST_GUARDRAILS = {
  corsOrigin: 'https://meal-prep.test',
  bodyLimitBytes: 64 * 1024,
  writeRateLimit: 1000,
  writeRateWindowMs: 60_000,
  recipesMax: 1000,
  trustProxy: false,
};

export async function startApp(t, { staticRoot, guardrails, notice } = {}) {
  // Before, not after: a test that fails halfway through cannot leave rows for the next one.
  await truncateAllTables();

  const pool = createPool(appDatabaseUrl());
  const app = await buildApp({
    pool,
    staticRoot,
    logger: false,
    guardrails: { ...TEST_GUARDRAILS, ...guardrails },
    // Undefined unless a test is about the banner, which leaves buildApp's own default: no notice
    // configured is what almost every deployment and every other test here is.
    notice,
  });
  await app.ready();

  t.after(async () => {
    await app.close();
    await pool.end();
  });

  return app;
}
