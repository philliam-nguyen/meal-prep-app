// The recorded Seed: one real `GET /api/state` response, captured against a real Postgres and
// carried in the frontend bundle so that a Reviewer who arrives while the backend is unreachable
// sees the app rather than a blank page (ADR-0009).
//
// Captured, never computed. Deriving this from seedFixture.js in JavaScript is the obvious approach
// and the wrong one: only one of the six fields in the payload is stored data, and reimplementing
// the Shopping List's per-unit sum or the Best Match ranking would put a second implementation of
// each in the codebase, which is the defect state.js records having removed. A recording has no
// second implementation because it has no implementation.
//
// Nothing here knows which Variant it is. Both carry the file and the Homelab Variant never reads
// it, because there the API serves the bundle and an API that cannot answer cannot serve the page
// that would fall back. Inert rather than conditional, the same shape as Protected (ADR-0002).
//
// ajv arrives as a devDependency: this module is a build step and a test seam, and no server path
// imports it.

import Ajv from 'ajv';
import { ajvOptions } from '@meal-prep/shared';
import { buildApp } from './app.js';
import { restoreSeed } from './seeding.js';
import { stateResponse } from './state.js';

/**
 * The freshness mark the recording ships instead of the live one. readVersion builds a version from
 * `max(updated_at)`, wall-clock times written as the Seed loads, so two recordings of one fixture
 * differ in it and in nothing else. Keeping it would leave the build unable to tell a Seed that
 * changed from a clock that moved, and the recording could then never be checked for staleness.
 *
 * It is also the safer value to ship. ADR-0009 requires that the recorded version never becomes the
 * freshness poll's baseline, because recovery would otherwise depend on it differing from the live
 * one, and occasionally it would not. Every live version begins with a count of microseconds, so
 * this one can never equal it. The unconditional refetch that ADR asks for is still the defence;
 * this makes the collision it defends against impossible rather than merely unlikely.
 */
export const RECORDED_VERSION = 'recorded';

const validate = new Ajv(ajvOptions).compile(stateResponse);

// ajv's own errorsText drops the params, so a payload carrying a field the schema has never heard of
// reports "must NOT have additional properties" and leaves whoever reads the build log to guess
// which one. The params carry the name, and the name is the whole of the answer.
const describeError = (error) =>
  `${error.instancePath || 'the payload'} ${error.message} ${JSON.stringify(error.params)}`;

/**
 * The payload, or a refusal naming what about it no longer matches the first-paint response.
 *
 * This is the check that makes the recording fail the build rather than the outage. `stateResponse`
 * is the schema Fastify already serializes the live response through, so a field added to the
 * payload leaves a recording taken before it short of something the schema requires, and a field
 * removed leaves one carrying something `additionalProperties: false` refuses. Both directions are
 * drift, and both are invisible until the one moment the fallback is all a Reviewer has.
 */
export function assertRecorded(payload) {
  if (validate(payload)) return payload;
  const errors = validate.errors.map(describeError).join('; ');
  throw new Error(`the recorded Seed no longer matches stateResponse: ${errors}`);
}

/**
 * Loads the Seed into the given database and reads the first-paint payload back out of it.
 *
 * Through `restoreSeed` and then through the app's own route, so the recording is a response the
 * API produced rather than an assembly of what the fixture says. The pool must be connected as the
 * owner role, because the restore truncates before it loads.
 */
export async function recordSeed({ pool, guardrails }) {
  await restoreSeed({ pool, guardrails });

  // No notice is passed, so the recording carries null whatever the machine taking it configured.
  // Determinism is the first reason: the file is compared byte for byte against a recording made
  // now, and a build machine with SITE_NOTICE set would otherwise bake its own banner into the
  // bundle and fail that comparison everywhere else.
  //
  // It also settles which banners a visitor can meet at once. The frontend's notice follows the
  // payload on screen, so degraded mode renders this null and the offline banner stands alone,
  // already saying the data is a fixed sample of the demo data, which is what the other one would
  // have been there to say. A visitor restored from cache during an outage sees the opposite pair:
  // their cached notice and no offline banner, because a load with a screenful behind it never
  // falls back to the recording. Either way the two cannot stack, by construction rather than by
  // anyone styling around it.
  const app = await buildApp({ pool, logger: false, guardrails });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/state' });
    if (response.statusCode !== 200) {
      throw new Error(`the recording read ${response.statusCode} from /api/state: ${response.body}`);
    }
    return assertRecorded({ ...response.json(), version: RECORDED_VERSION });
  } finally {
    await app.close();
  }
}

/**
 * The bytes the file holds. Here rather than at the point of writing so that the check on the
 * committed recording compares against what the recorder would write, down to the formatting: a
 * file that differs by so much as its indentation was edited by hand, and a recording edited by hand
 * is a fixture nothing regenerates.
 */
export function serializeRecording(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}
