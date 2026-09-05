// The API on a throwaway Postgres, alive for the length of one command. What the browser suite
// talks to: a real API over a real socket, on a database that did not exist a moment ago and will
// not exist once this exits.
//
// The API's own entrypoint refuses to start without a frontend bundle, because in a deployment
// serving the bundle is half of what the process is for. Here the frontend is Vite's dev server
// proxying `/api` to this port, so there is no bundle and no reason to build one before a browser
// run. Not a flag on server.js: a switch that lets a deployment start without its frontend is a
// switch a deployment will one day flip, and ADR-0002 has no room for a mode.
//
// The database boots the way the suite's and the recording's do, through src/throwawayPostgres.js,
// so a green browser run says the same thing about migrations and grants that a green API run does.
// The pattern is record.js's: one command, one container, torn down in `finally`.

import { buildApp } from './app.js';
import { createPool } from './db.js';
import { startThrowawayPostgres } from './throwawayPostgres.js';

const log = (message) => console.log(`throwaway: ${message}`);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// The one guardrail with no default, for the reason config.js gives: the wrapper has to name the
// origin. Here the wrapper is playwright.config.js, and the origin is the dev server's, because that
// is what the browser puts in the Origin header when the proxied app writes.
const corsOrigin = required('CORS_ORIGIN');
const port = Number(required('PORT'));

// Loose on purpose, and the same numbers as the API suite's TEST_GUARDRAILS in test/helpers/app.js,
// for the same reason: a browser test is never about a limit, and one it tripped by accident would
// be asserting on a number nobody chose. Repeated rather than imported because src never imports
// test; the two lists are allowed to drift, and a test that needs a tight limit belongs in the API
// suite where limits are the subject.
const guardrails = {
  corsOrigin,
  bodyLimitBytes: 64 * 1024,
  writeRateLimit: 1000,
  writeRateWindowMs: 60_000,
  recipesMax: 1000,
  trustProxy: false,
};

log('starting a throwaway Postgres');
const postgres = await startThrowawayPostgres();
const pool = createPool(postgres.appUrl, 'meal-prep-throwaway');

// No staticRoot on purpose: buildApp's default is where a build would land, and a stale dist there
// is served by this origin but never asked for, because the browser is pointed at Vite.
const app = await buildApp({ pool, logger: { level: process.env.LOG_LEVEL ?? 'warn' }, guardrails });

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received, shutting down`);
  try {
    await app.close();
    await pool.end();
  } finally {
    await postgres.stop();
  }
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(signal));

try {
  // Loopback only. This holds a database with no password anyone chose, on a developer's machine
  // or a CI runner, and nothing off the host has a reason to reach it.
  await app.listen({ host: '127.0.0.1', port });
  log(`listening on http://127.0.0.1:${port}, as ${postgres.appRole}`);
} catch (error) {
  console.error('the throwaway API could not start');
  console.error(error);
  await pool.end();
  await postgres.stop();
  process.exit(1);
}
