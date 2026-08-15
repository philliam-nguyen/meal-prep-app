// The Homelab Variant is compose.yaml plus Tailscale and a backup job, so the two properties that
// keep it private are properties of this file: the API is reachable only through the loopback
// address `tailscale serve` proxies from, and nothing depends on a path that exists on one host.
// Both are one careless edit away from being untrue and neither fails visibly when it breaks, so
// they are asserted here rather than left to review.
//
// Compose resolves the file against `.env.example` rather than a developer's `.env`, which keeps
// the assertions the same on every machine and makes the example file prove it is still a working
// configuration. The passwords it deliberately leaves blank are the only values supplied here.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const publishedImage = 'registry.example/meal-prep:published';

function composeConfig(files) {
  const fileFlags = files.flatMap((file) => ['--file', file]);
  const json = execFileSync(
    'docker',
    ['compose', ...fileFlags, '--env-file', '.env.example', 'config', '--format', 'json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        POSTGRES_OWNER_PASSWORD: 'test-owner-password',
        APP_DB_PASSWORD: 'test-app-password',
        MEAL_PREP_IMAGE: publishedImage,
      },
    },
  );
  return JSON.parse(json);
}

// One resolution for the whole file. The document does not change between tests, and asking Compose
// again for each one costs about a second every time.
const deployed = composeConfig(['compose.yaml']);

test('the API is published to the loopback address only', () => {
  const { ports } = deployed.services.api;

  assert.equal(ports.length, 1);
  assert.equal(ports[0].host_ip, '127.0.0.1');
  assert.equal(ports[0].target, 8080);
});

test('the database is not published at all', () => {
  assert.equal(deployed.services.db.ports, undefined);
});

test('no service mounts a path from the host', () => {
  const mounts = Object.values(deployed.services).flatMap((service) => service.volumes ?? []);

  assert.deepEqual(
    mounts.filter((mount) => mount.type !== 'volume'),
    [],
  );
});

test('the database keeps its data in a named volume that outlives the container', () => {
  const [data] = deployed.services.db.volumes;

  assert.equal(data.target, '/var/lib/postgresql/data');
  assert.equal(data.type, 'volume');
  assert.ok(deployed.volumes[data.source]);
});

test('the API and the migration step run the same published image', () => {
  assert.equal(deployed.services.api.image, publishedImage);
  assert.equal(deployed.services.migrate.image, publishedImage);
});

test('bringing the stack up builds nothing, so what runs is what was published', () => {
  const built = Object.entries(deployed.services)
    .filter(([, service]) => service.build)
    .map(([name]) => name);

  assert.deepEqual(built, []);
});

test('the build override builds the image the stack runs, from this repository', () => {
  const { services } = composeConfig(['compose.yaml', 'compose.build.yaml']);

  assert.equal(services.api.image, publishedImage);
  assert.equal(services.api.build.context, repoRoot);
});
