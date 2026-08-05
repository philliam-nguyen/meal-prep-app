// One smoke test over a real listener, covering the socket layer that inject skips (ADR-0005).
// Everything else in the suite goes through inject.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from './helpers/app.js';

test('the API answers over a bound socket', async (t) => {
  const app = await startApp(t);

  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await fetch(new URL('/api/health', address));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'up' });
});
