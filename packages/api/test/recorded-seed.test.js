// The recorded Seed, and the things that stop it going stale (ADR-0009). It is dead code until an
// outage: local development, this suite and every normal page load use the live API, so drift never
// surfaces until the one moment the fallback is the only thing between a Reviewer and a blank page.
//
// The first group asserts through the seam ADR-0005 fixes, because a recording is a response and the
// question is whether it is the response the API gives. The rest do not send a request, for the same
// reason test/compose.test.js does not: what they guard is a file being current and being carried
// into the bundle, neither of which is reachable over HTTP and both of which break in silence.

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { recordedSeedFile } from '../src/config.js';
import { RECORDED_VERSION, assertRecorded, serializeRecording } from '../src/recording.js';
import { startApp } from './helpers/app.js';
import { readState } from './helpers/recipes.js';
import { recordTheSeed } from './helpers/seed.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const readRecordedSeed = () => readFile(recordedSeedFile, 'utf8');

// A ceiling rather than a measurement: the recording is fetched only once the live call has already
// failed, so it is never in the way of first paint, and this is here to notice a Seed grown into
// something a phone on a bad connection would wait for.
const FIRST_PAINT_BUDGET_BYTES = 64 * 1024;

describe('recording the Seed', () => {
  it('is the first-paint payload the API answers with, freshness mark aside', async (t) => {
    const app = await startApp(t);

    const recorded = await recordTheSeed(t);

    const live = await readState(app);
    assert.deepEqual(recorded, { ...live, version: RECORDED_VERSION });
    assert.ok(recorded.recipes.length > 0, 'the recording holds no Recipes');
    assert.ok(recorded.shoppingList.length > 0, 'the recording holds no Shopping List');
    assert.ok(recorded.pantryChecklist.length > 0, 'the recording holds no Pantry checklist');
    assert.ok(recorded.staples.length > 0, 'the recording holds no Staples');
  });

  // Best Matches is the one list the recording cannot carry anything in, and it is empty because a
  // restored database is empty of Pantry ticks rather than because anything is missing: the ranking
  // needs a food in the Pantry, and the Seed marks Staples and shelves Aisles but ticks nothing. A
  // Reviewer arriving during an outage sees the same empty ranking a Reviewer arriving to a healthy
  // API sees before their first tick, and the tick itself is a write degraded mode has disabled.
  // Recording a payload with ticks in it would mean recording a state no restore produces.
  it('carries an empty ranking, because a restored database has nothing in the Pantry', async (t) => {
    await startApp(t);

    const recorded = await recordTheSeed(t);

    assert.deepEqual(recorded.bestMatches, []);
    assert.deepEqual(
      recorded.pantryChecklist.filter((ingredient) => ingredient.inPantry),
      [],
    );
  });

  // What lets the build regenerate the file on every push without the file itself becoming noise: a
  // recording that differed run to run could never be checked against the committed one, so a Seed
  // edited without a regeneration would go unnoticed. Ids are the half of this that is not obvious,
  // and they hold because the restore truncates with `restart identity`.
  it('gives the same recording twice', async (t) => {
    await startApp(t);

    const first = await recordTheSeed(t);
    const second = await recordTheSeed(t);

    assert.deepEqual(second, first);
    assert.equal(serializeRecording(second), serializeRecording(first));
  });

  // The live version is built from `max(updated_at)`, wall-clock times written as the Seed loads, so
  // two recordings taken seconds apart would differ in it and in nothing else. Replacing it also
  // takes away the collision ADR-0009 asks degraded mode to survive: a recorded version that happens
  // to equal the live one would leave a recovered client sitting on Seed data.
  it('replaces the freshness mark with one no live version can equal', async (t) => {
    const app = await startApp(t);

    const recorded = await recordTheSeed(t);

    const { version: live } = await readState(app);
    assert.equal(recorded.version, RECORDED_VERSION);
    assert.notEqual(recorded.version, live);
    assert.match(live, /^\d/, 'a live version no longer begins with a count of microseconds');
    assert.doesNotMatch(RECORDED_VERSION, /^\d/);
  });
});

// The check that fails the build rather than the outage. `stateResponse` is the schema Fastify
// already serializes the live response through, which is what makes reusing it worth more than
// writing a second one: it moves when the payload moves, and a recording taken before it moved stops
// matching.
describe('the recording check', () => {
  it('refuses a recording missing a field the payload requires', async (t) => {
    await startApp(t);
    const { bestMatches, ...withoutAField } = await recordTheSeed(t);

    assert.throws(() => assertRecorded(withoutAField), /bestMatches/);
  });

  it('refuses a recording carrying a field the payload does not have', async (t) => {
    await startApp(t);
    const recorded = await recordTheSeed(t);

    assert.throws(() => assertRecorded({ ...recorded, aisles: [] }), /aisles/);
  });
});

describe('the recorded Seed in the bundle', () => {
  it('is what a recording made now produces', async (t) => {
    await startApp(t);
    const recorded = await recordTheSeed(t);

    const inTheBundle = JSON.parse(await readRecordedSeed());

    assert.deepEqual(
      inTheBundle,
      recorded,
      'the recorded Seed is stale. Run: npm run record',
    );
  });

  // Byte for byte, because a file that differs by so much as its indentation was written by hand,
  // and a hand-written fixture drifts the first time anyone edits the Seed.
  it('is written by the recorder rather than by hand', async (t) => {
    await startApp(t);
    const recorded = await recordTheSeed(t);

    const onDisk = await readRecordedSeed();

    assert.ok(
      onDisk === serializeRecording(recorded),
      'the recorded Seed was not written by the recorder. Run: npm run record',
    );
  });

  it('validates against the payload schema as it stands', async () => {
    const inTheBundle = JSON.parse(await readRecordedSeed());

    assert.equal(assertRecorded(inTheBundle), inTheBundle);
  });

  it('is small enough not to matter to first paint', async () => {
    const { size } = await stat(recordedSeedFile);

    assert.ok(size < FIRST_PAINT_BUDGET_BYTES, `the recorded Seed is ${size} bytes`);
  });

  // Vite copies its public directory into the bundle verbatim, so this is what "the bundle carries
  // the file" amounts to. Asserted against the path and the config rather than against a real build,
  // for the reason frontend-bundle.test.js gives: the suite does not depend on `npm run build`
  // having run.
  it('lands where Vite copies it into the bundle', async () => {
    const config = await readFile(resolve(repositoryRoot, 'packages/web/vite.config.js'), 'utf8');

    assert.equal(
      relative(repositoryRoot, recordedSeedFile).split('\\').join('/'),
      'packages/web/public/recorded-seed.json',
    );
    assert.doesNotMatch(config, /publicDir/, 'Vite no longer copies public/ into the bundle');
  });

  // Staleness is the real risk here, so regenerating has to be something the build does rather than
  // something a person remembers. The image build cannot do it, having no Docker daemon inside it,
  // which is why the file is committed and why this is the assertion that the build still refreshes
  // it before Vite copies it.
  it('is regenerated by the build rather than by anyone remembering to', async () => {
    const { scripts } = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));

    const [records, builds] = scripts.build.split('&&');
    assert.match(records, /npm run record --workspace @meal-prep\/api/);
    assert.match(builds, /npm run build --workspace @meal-prep\/web/);
  });
});
