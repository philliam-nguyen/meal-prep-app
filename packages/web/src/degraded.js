// The backend runs on a home server with residential power and residential internet, so it will be
// unreachable sometimes, and the visitor who clicks the link during those hours forms the only
// impression they will ever form. When the API cannot answer the first paint, the app renders the
// recording the bundle ships instead and turns off every control that writes, because a dead link
// reads worse than an app that says what is wrong (ADR-0009).
//
// Nothing here asks which Variant it is. The Homelab Variant carries the recording and never reads
// it: the API serves the bundle there too, so an API that cannot answer cannot serve the page that
// would fall back. The file is inert rather than conditional, the same shape as the Protected
// column (ADR-0002).

import { fetchState } from './api.js';

// Vite copies public/ into the bundle verbatim, so the recording sits at the bundle's root. A
// relative path like every other, for the reason api.js gives.
const RECORDED_SEED_PATH = '/recorded-seed.json';

/**
 * What the banner says while the recording is on screen. It names both halves of the situation,
 * because a visitor who is told only that something is wrong reaches for the refresh button.
 */
export const OFFLINE_NOTICE =
  'The backend is offline. This is a fixed sample of the demo data: everything can be browsed, and ' +
  'nothing can be changed until it is back.';

/** The recording ticket 21's build step wrote into the bundle. */
export async function fetchRecordedSeed() {
  const response = await fetch(RECORDED_SEED_PATH);
  if (!response.ok) throw new Error(`GET ${RECORDED_SEED_PATH} returned ${response.status}`);
  return response.json();
}

/**
 * The state one load puts on screen, and whether it is the recording: the live answer whenever the
 * API gives one, and the recorded Seed when it cannot and there is nothing on screen to lose.
 *
 * `nothingOnScreen` is what keeps a background reload that failed from replacing a cook's own
 * Recipes with a fixed sample of somebody else's. A load that has something to fall back on behind
 * it fails the way it always did, and the caller keeps what it already had.
 */
export async function readRenderableState({
  nothingOnScreen,
  readLive = fetchState,
  readRecording = fetchRecordedSeed,
}) {
  try {
    return { state: await readLive(), degraded: false };
  } catch (unreachable) {
    if (!nothingOnScreen) throw unreachable;
    return { state: await readRecording(), degraded: true };
  }
}
