// The seam every test after this one uses: an app wired to the real Postgres as the restricted
// role, driven through Fastify's inject (ADR-0005). No mocks, no bound socket.

import { buildApp } from '../../src/app.js';
import { createPool } from '../../src/db.js';
import { appDatabaseUrl, truncateAllTables } from './database.js';

export async function startApp(t, { staticRoot } = {}) {
  // Before, not after: a test that fails halfway through cannot leave rows for the next one.
  await truncateAllTables();

  const pool = createPool(appDatabaseUrl());
  const app = buildApp({ pool, staticRoot, logger: false });
  await app.ready();

  t.after(async () => {
    await app.close();
    await pool.end();
  });

  return app;
}
