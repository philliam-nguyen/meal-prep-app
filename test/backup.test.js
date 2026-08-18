// Exercises ops/backup/dump.sh and ops/backup/check-backup.sh against a real, disposable Postgres
// container the way test/compose.test.js already shells out to Docker for the deployment file.
// Nothing here sends an HTTP request to the app or touches the app's own database, so it sits
// outside ADR-0005's HTTP seam the way that file does too: what this guards is an operations
// script, not application behaviour.
//
// The scripts assume a real `docker` on the host - the Homelab Variant's runbook already requires
// one for Compose. This sandbox reaches a real Docker Engine through dockerode (the same
// mechanism @testcontainers/postgresql already relies on in packages/api's suite) but has no
// `docker` CLI binary on PATH for a shell to invoke, so test/helpers/docker-shim/docker stands in
// for it: a thin forwarder covering only the two subcommands these scripts call. It is prepended
// onto PATH for the child process only, and neither script has any idea it exists.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { test, before, after } from 'node:test';
import Docker from 'dockerode';

const repoRoot = resolve(import.meta.dirname, '..');
const backupDir = join(repoRoot, 'ops', 'backup');
const shimDir = join(repoRoot, 'test', 'helpers', 'docker-shim');
const containerName = 'meal-prep-backup-test-db';
const dbPassword = 'test-owner-password';
const dbName = 'meal_prep';
const dbRole = 'meal_prep_owner';

const docker = new Docker();
const scratchDirs = [];

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'meal-prep-backup-'));
  scratchDirs.push(dir);
  return dir;
}

function envFile(dir) {
  const file = join(dir, '.env');
  writeFileSync(
    file,
    `POSTGRES_OWNER_ROLE=${dbRole}\nPOSTGRES_OWNER_PASSWORD=${dbPassword}\nPOSTGRES_DB=${dbName}\n`,
  );
  return file;
}

// Compose.yaml itself defaults POSTGRES_DB (and POSTGRES_OWNER_ROLE), so an Operator's real .env
// legitimately omits it. This is the shape that exposed the set -euo pipefail bug: grep finding no
// match for POSTGRES_DB= used to make the whole script exit before fail() was ever reachable.
function envFileMissingDb(dir) {
  const file = join(dir, '.env');
  writeFileSync(file, `POSTGRES_OWNER_ROLE=${dbRole}\nPOSTGRES_OWNER_PASSWORD=${dbPassword}\n`);
  return file;
}

// Async on purpose, not spawnSync: a couple of tests run an in-process HTTP server standing in
// for ntfy, and spawnSync blocks this process's event loop for the whole child run, which starves
// that server of the chance to answer the very request the child is making. spawn keeps the event
// loop free while the script runs.
//
// NTFY_TOPIC defaults to a placeholder here because both scripts now refuse to start at all
// without one (require_alert_channel in ops/backup/alert.sh) - every test needs it set just to get
// past that check, whether or not the test cares about an alert actually arriving. The one test
// that cares about its absence overrides it back to empty explicitly.
function runScript(script, env) {
  const child = spawn('bash', [join(backupDir, script)], {
    env: {
      ...process.env,
      PATH: `${shimDir}${delimiter}${process.env.PATH}`,
      BACKUP_CONFIG_FILE: join(scratch(), 'no-such-config'),
      NTFY_TOPIC: 'test-topic',
      ...env,
    },
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (status) => resolvePromise({ status, stdout, stderr }));
  });
}

// A tiny stand-in for ntfy: the scripts POST to $NTFY_URL/$NTFY_TOPIC with a Title header and a
// plain-text body, and this is all alert() in ops/backup/alert.sh needs from the other end.
function startAlertStub() {
  const received = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({ path: req.url, title: req.headers.title, body });
      res.writeHead(200);
      res.end('ok');
    });
  });
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolvePromise({
        url: `http://127.0.0.1:${port}`,
        received,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function fileSize(path) {
  return statSync(path).size;
}

// Local date, to match `date +%F` inside the scripts - not toISOString's UTC date, which can be a
// day ahead of the host's local date and was exactly the bug the first version of this test had.
function dateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function today() {
  return dateString(new Date());
}

before(async () => {
  const existing = docker.getContainer(containerName);
  await existing.remove({ force: true }).catch(() => {});

  const container = await docker.createContainer({
    Image: 'postgres:17-alpine',
    name: containerName,
    Env: [`POSTGRES_DB=${dbName}`, `POSTGRES_USER=${dbRole}`, `POSTGRES_PASSWORD=${dbPassword}`],
  });
  await container.start();

  const deadline = Date.now() + 30_000;
  for (;;) {
    const execInstance = await container.exec({
      Cmd: ['pg_isready', '-U', dbRole],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await execInstance.start({ hijack: true, stdin: false });
    await new Promise((resolvePromise, reject) => {
      stream.on('data', () => {});
      stream.on('end', resolvePromise);
      stream.on('error', reject);
    });
    const { ExitCode } = await execInstance.inspect();
    if (ExitCode === 0) break;
    if (Date.now() > deadline) throw new Error('postgres test container never became ready');
    await new Promise((r) => setTimeout(r, 500));
  }
});

after(async () => {
  await docker
    .getContainer(containerName)
    .remove({ force: true })
    .catch(() => {});
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

test('a nightly dump produces a non-empty, dated file naming the stack, and lands offsite', async () => {
  const dir = scratch();
  const dumpDir = join(dir, 'dumps');
  const offsite = join(dir, 'offsite');

  const result = await runScript('dump.sh', {
    HOMELAB_DB_CONTAINER: containerName,
    COMPOSE_ENV_FILE: envFile(dir),
    BACKUP_STACK_NAME: 'homelab-variant',
    BACKUP_DIR: dumpDir,
    OFFSITE_DEST: offsite,
    RETENTION_COUNT: '30',
  });

  assert.equal(result.status, 0, result.stderr);

  const expectedName = `homelab-variant_${today()}.sql`;
  assert.ok(readdirSync(dumpDir).includes(expectedName));
  assert.ok(fileSize(join(dumpDir, expectedName)) > 0);

  assert.ok(readdirSync(offsite).includes(expectedName), 'dump did not land offsite');
  assert.ok(fileSize(join(offsite, expectedName)) > 0);
});

test('a missing named container refuses the dump and alerts, rather than dumping whatever is running', async () => {
  const dir = scratch();
  const stub = await startAlertStub();

  const result = await runScript('dump.sh', {
    HOMELAB_DB_CONTAINER: 'meal-prep-db-does-not-exist',
    COMPOSE_ENV_FILE: envFile(dir),
    BACKUP_DIR: join(dir, 'dumps'),
    OFFSITE_DEST: join(dir, 'offsite'),
    NTFY_URL: stub.url,
    NTFY_TOPIC: 'test-topic',
  });
  await stub.close();

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /meal-prep-db-does-not-exist/);
  assert.equal(stub.received.length, 1);
  assert.match(stub.received[0].title, /backup/i);
});

test('retention prunes down to the configured count, oldest dates first', async () => {
  const dir = scratch();
  const dumpDir = join(dir, 'dumps');
  mkdirSync(dumpDir, { recursive: true });

  const dates = [1, 2, 3, 4, 5].map((daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return dateString(d);
  });
  for (const date of dates) {
    writeFileSync(join(dumpDir, `homelab-variant_${date}.sql`), '-- pre-existing dump\n');
  }

  const result = await runScript('dump.sh', {
    HOMELAB_DB_CONTAINER: containerName,
    COMPOSE_ENV_FILE: envFile(dir),
    BACKUP_STACK_NAME: 'homelab-variant',
    BACKUP_DIR: dumpDir,
    OFFSITE_DEST: join(dir, 'offsite'),
    RETENTION_COUNT: '3',
  });

  assert.equal(result.status, 0, result.stderr);

  const remaining = readdirSync(dumpDir).sort();
  assert.equal(remaining.length, 3);
  assert.ok(remaining.includes(`homelab-variant_${today()}.sql`));
  // the oldest three of the five pre-seeded dumps, plus the pre-existing newest two, minus today's
  // new one pushing the total to six pre-prune: the three oldest dates should be gone.
  assert.ok(!remaining.includes(`homelab-variant_${dates[4]}.sql`));
  assert.ok(!remaining.includes(`homelab-variant_${dates[3]}.sql`));
  assert.ok(!remaining.includes(`homelab-variant_${dates[2]}.sql`));
  assert.ok(remaining.includes(`homelab-variant_${dates[0]}.sql`));
  assert.ok(remaining.includes(`homelab-variant_${dates[1]}.sql`));
});

test('a missing offsite destination fails the whole run rather than keeping the dump local only', async () => {
  const dir = scratch();
  // This failure goes through fail() -> alert() same as any other, so it needs somewhere to POST
  // to - without a stub here it would otherwise reach the real https://ntfy.sh with a fake topic.
  const stub = await startAlertStub();

  const result = await runScript('dump.sh', {
    HOMELAB_DB_CONTAINER: containerName,
    COMPOSE_ENV_FILE: envFile(dir),
    BACKUP_DIR: join(dir, 'dumps'),
    OFFSITE_DEST: '',
    NTFY_URL: stub.url,
  });
  await stub.close();

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /OFFSITE_DEST/);
  assert.equal(stub.received.length, 1);
});

test('the daily check treats a zero-byte dump as a failure, not a success', async () => {
  const dir = scratch();
  const dumpDir = join(dir, 'dumps');
  mkdirSync(dumpDir, { recursive: true });
  writeFileSync(join(dumpDir, `homelab-variant_${today()}.sql`), '');

  const stub = await startAlertStub();
  const result = await runScript('check-backup.sh', {
    BACKUP_DIR: dumpDir,
    BACKUP_STACK_NAME: 'homelab-variant',
    NTFY_URL: stub.url,
    NTFY_TOPIC: 'test-topic',
  });
  await stub.close();

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /zero bytes/);
  assert.equal(stub.received.length, 1);
});

test('the daily check treats a dump missing for today as a failure, not as silently skipped', async () => {
  const dir = scratch();
  const dumpDir = join(dir, 'dumps');
  mkdirSync(dumpDir, { recursive: true });

  const stub = await startAlertStub();
  const result = await runScript('check-backup.sh', {
    BACKUP_DIR: dumpDir,
    BACKUP_STACK_NAME: 'homelab-variant',
    NTFY_URL: stub.url,
    NTFY_TOPIC: 'test-topic',
  });
  await stub.close();

  assert.notEqual(result.status, 0);
  assert.equal(stub.received.length, 1);
  assert.match(stub.received[0].title, /backup/i);
});

test('a .env that omits POSTGRES_DB (compose.yaml defaults it) still dumps rather than dying mute', async () => {
  const dir = scratch();
  const dumpDir = join(dir, 'dumps');
  const offsite = join(dir, 'offsite');

  const result = await runScript('dump.sh', {
    HOMELAB_DB_CONTAINER: containerName,
    COMPOSE_ENV_FILE: envFileMissingDb(dir),
    BACKUP_STACK_NAME: 'homelab-variant',
    BACKUP_DIR: dumpDir,
    OFFSITE_DEST: offsite,
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const expectedName = `homelab-variant_${today()}.sql`;
  assert.ok(readdirSync(dumpDir).includes(expectedName));
  assert.ok(fileSize(join(dumpDir, expectedName)) > 0);
});

test('a blank NTFY_TOPIC fails dump.sh at the start, before touching the container or the .env', async () => {
  const dir = scratch();

  const result = await runScript('dump.sh', {
    HOMELAB_DB_CONTAINER: 'this-container-is-never-checked',
    COMPOSE_ENV_FILE: join(dir, 'does-not-exist'),
    BACKUP_DIR: join(dir, 'dumps'),
    OFFSITE_DEST: join(dir, 'offsite'),
    NTFY_TOPIC: '',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /NTFY_TOPIC/);
});

test('a blank NTFY_TOPIC fails check-backup.sh at the start the same way', async () => {
  const dir = scratch();

  const result = await runScript('check-backup.sh', {
    BACKUP_DIR: join(dir, 'dumps'),
    NTFY_TOPIC: '',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /NTFY_TOPIC/);
});

test('the daily check passes quietly, and alerts nothing, against a healthy dump', async () => {
  const dir = scratch();
  const dumpDir = join(dir, 'dumps');
  mkdirSync(dumpDir, { recursive: true });
  writeFileSync(join(dumpDir, `homelab-variant_${today()}.sql`), '-- a real looking dump\n');

  const stub = await startAlertStub();
  const result = await runScript('check-backup.sh', {
    BACKUP_DIR: dumpDir,
    BACKUP_STACK_NAME: 'homelab-variant',
    NTFY_URL: stub.url,
    NTFY_TOPIC: 'test-topic',
  });
  await stub.close();

  assert.equal(result.status, 0, result.stderr);
  assert.equal(stub.received.length, 0);
});
