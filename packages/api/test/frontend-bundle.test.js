// The API serves the frontend from its own origin, so the frontend calls relative paths and
// carries no per-Variant configuration (ADR-0002). Serving is asserted against a fixture directory
// rather than a real build, so the suite does not depend on `npm run build` having run; a separate
// assertion pins the default root to where the build actually lands.

import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { defaultWebDist } from '../src/config.js';
import { startApp } from './helpers/app.js';

const INDEX_HTML = '<!doctype html><title>Meal Prep</title><script src="/assets/app.js"></script>';

async function bundleFixture() {
  const root = await mkdtemp(join(tmpdir(), 'meal-prep-bundle-'));
  await writeFile(join(root, 'index.html'), INDEX_HTML);
  await writeFile(join(root, 'app.js'), 'export const built = true;\n');
  return root;
}

test('requesting the root serves the built frontend', async (t) => {
  const app = await startApp(t, { staticRoot: await bundleFixture() });

  const response = await app.inject({ method: 'GET', url: '/' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.equal(response.body, INDEX_HTML);
});

test('bundle assets serve alongside the API', async (t) => {
  const app = await startApp(t, { staticRoot: await bundleFixture() });

  const response = await app.inject({ method: 'GET', url: '/app.js' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /built = true/);
});

test('an unknown path is a 404 rather than the frontend', async (t) => {
  const app = await startApp(t, { staticRoot: await bundleFixture() });

  const response = await app.inject({ method: 'GET', url: '/api/nothing-here' });

  assert.equal(response.statusCode, 404);
});

test('the frontend is served from where the build writes it', () => {
  const packageRoot = resolve(import.meta.dirname, '..');

  assert.equal(defaultWebDist, resolve(packageRoot, '../web/dist'));
});
