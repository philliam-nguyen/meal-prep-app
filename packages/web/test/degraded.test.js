// The backend sits on a home server, so it will be unreachable sometimes, and the visitor who clicks
// during those hours forms the only impression they will ever form (ADR-0009). What is asserted here
// is which of the two answers a load puts on screen, because that decision is the whole of degraded
// mode: everything downstream of it only reads the flag it hands back.
//
// The two readers are injected rather than mocked away, the same way freshness.js takes a browser,
// so nothing here needs a network or a document.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readRenderableState } from '../src/degraded.js';

const LIVE = { version: '1700000000000000-4', recipes: ['live'] };
const RECORDING = { version: 'recorded', recipes: ['sample'] };

const unreachable = () => Promise.reject(new Error('GET /api/state returned 502'));

describe('what a load puts on screen', () => {
  it('is the live state whenever the API answers', async () => {
    const answer = await readRenderableState({
      nothingOnScreen: true,
      readLive: () => Promise.resolve(LIVE),
      readRecording: () => assert.fail('the recording was read while the API was answering'),
    });

    assert.deepEqual(answer, { state: LIVE, degraded: false });
  });

  it('is the recorded Seed when the API cannot answer the first paint', async () => {
    const answer = await readRenderableState({
      nothingOnScreen: true,
      readLive: unreachable,
      readRecording: () => Promise.resolve(RECORDING),
    });

    assert.deepEqual(answer, { state: RECORDING, degraded: true });
  });

  // A background reload that fails is a reload that failed, not an outage worth replacing a cook's
  // own Recipes with a fixed sample of somebody else's. The caller keeps what it has and says so in
  // the way it already did.
  it('is nothing at all when a reload fails with data already on screen', async () => {
    await assert.rejects(
      readRenderableState({
        nothingOnScreen: false,
        readLive: unreachable,
        readRecording: () => assert.fail('the recording replaced what was already on screen'),
      }),
      /502/,
    );
  });

  // The bundle is served by the API in the Homelab Variant, so a failed live call there means the
  // recording is unreachable too. It fails the way any other load failure does rather than becoming
  // a second thing the caller has to handle.
  it('is nothing at all when the recording cannot be read either', async () => {
    await assert.rejects(
      readRenderableState({
        nothingOnScreen: true,
        readLive: unreachable,
        readRecording: () => Promise.reject(new Error('GET /recorded-seed.json returned 404')),
      }),
      /recorded-seed/,
    );
  });
});
