// The banner text a deployment may configure, and the silence a deployment that configures none
// gets. Nothing here names a Variant, and nothing in the app can: the Demo Variant's banner is a
// value its wrapper sets and the Homelab Variant's absence of one is an unset environment variable
// rather than a branch (ADR-0002). The variable's name says nothing about demos for the same reason.
//
// Asserted at the state payload, because that is the whole of what the API contributes: the frontend
// renders the text when one arrives and nothing when none does, so an API answering the wrong thing
// here is the entire bug. `stateResponse` sets `additionalProperties: false`, so a notice that is
// not declared in the schema never reaches a browser at all - which is what the first test would
// catch before anyone saw a blank banner.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readServerConfig } from '../src/config.js';
import { startApp } from './helpers/app.js';
import { readState } from './helpers/recipes.js';
import { recordTheSeed } from './helpers/seed.js';

const NOTICE = 'This is a demo instance. The data is a fixture and is restored nightly.';

const env = {
  DATABASE_URL: 'postgres://app@db:5432/meal_prep',
  CORS_ORIGIN: 'https://meal-prep.example',
};

describe('the notice in the first-paint payload', () => {
  it('is null where nothing configured one', async (t) => {
    const app = await startApp(t);

    assert.equal((await readState(app)).notice, null);
  });

  it('is the text the deployment configured', async (t) => {
    const app = await startApp(t, { notice: NOTICE });

    assert.equal((await readState(app)).notice, NOTICE);
  });
});

describe('reading the notice from the environment', () => {
  it('takes the text the wrapper set', () => {
    assert.equal(readServerConfig({ ...env, SITE_NOTICE: NOTICE }).notice, NOTICE);
  });

  it('reads a variable nobody set as no notice at all', () => {
    assert.equal(readServerConfig(env).notice, null);
  });

  it('reads a variable left blank the same way', () => {
    // How an unset value actually arrives: Compose renders a variable nobody set as an empty
    // string rather than omitting it, and both mean the deployment wants no banner.
    assert.equal(readServerConfig({ ...env, SITE_NOTICE: '' }).notice, null);
  });
});

describe('the recorded Seed', () => {
  // By construction rather than by the recording machine happening to configure nothing: the
  // recorder builds its app without a notice, so the field is null in every recording and the file
  // stays the deterministic thing ADR-0009 needs it to be. It also settles what a visitor sees
  // during an outage, since the frontend's banner follows the payload on screen: the configured
  // notice cannot appear beside ticket 22's offline banner, because degraded mode is rendering a
  // payload whose notice is null.
  it('carries no notice whatever the machine recording it configured', async (t) => {
    await startApp(t);

    const recorded = await recordTheSeed(t);

    assert.equal(recorded.notice, null);
  });
});
