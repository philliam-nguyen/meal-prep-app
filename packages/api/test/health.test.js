import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { appDatabaseUrl } from './helpers/database.js';
import { startApp, TEST_GUARDRAILS } from './helpers/app.js';

test('the health path reports success and a reachable database', async (t) => {
  const app = await startApp(t);

  const response = await app.inject({ method: 'GET', url: '/api/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok', database: 'up' });
});

// Owns its pool rather than borrowing the shared helper's, because it has to break it.
test('the health path reports failure when the database is unreachable', async (t) => {
  const pool = createPool(appDatabaseUrl());
  const app = await buildApp({ pool, logger: false, guardrails: TEST_GUARDRAILS });
  t.after(() => app.close());
  await app.ready();
  await pool.end();

  const response = await app.inject({ method: 'GET', url: '/api/health' });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().database, 'down');
});
