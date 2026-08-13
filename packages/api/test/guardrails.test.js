// The boundary guardrails: per-IP write rate limiting, a request body size limit, CORS pinned to
// one origin, and an absolute ceiling on total Recipes (ADR-0001). Asserted where a client meets
// them rather than against the modules that implement them (ADR-0005).
//
// Every test here hands the app its own limits instead of generating enough traffic to trip a
// deployed one. That is the point rather than a convenience: if a limit could not be moved without
// a code change, these tests could not be written this way.
//
// Nothing in this file mentions a Variant. There is no flag to pass and no branch to cover, which
// is the whole of "the Homelab Variant inherits all of it" (ADR-0002).
//
// One bounded exception to the seam, declared rather than smuggled: the last describe block calls
// readServerConfig directly. Reading the environment has no HTTP surface to assert against, and the
// tests above prove only that the app applies the limits it is handed - not that a deployment hands
// it the ones its wrapper set. That gap is the whole of "moving a limit needs no code change", so it
// is worth one direct call. Nothing else in this file reaches past a request.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { RECIPE_INGREDIENTS_MAX } from '@meal-prep/shared';
import { readServerConfig } from '../src/config.js';
import { startApp } from './helpers/app.js';
import { createRecipe, readRecipes } from './helpers/recipes.js';

const ORIGIN = 'https://meal-prep.test';

const recipe = (name) => ({ name, type: 'Soup' });

const post = (app, payload, options = {}) =>
  app.inject({ method: 'POST', url: '/api/recipes', payload, ...options });

describe('rate limiting writes per IP', () => {
  it('refuses a write past the limit', async (t) => {
    const app = await startApp(t, { guardrails: { writeRateLimit: 2 } });

    await createRecipe(app, recipe('Leek and Potato Soup'));
    await createRecipe(app, recipe('Carrot Soup'));
    const refused = await post(app, recipe('Tomato Soup'));

    assert.equal(refused.statusCode, 429);
  });

  it('writes nothing for the request it refused', async (t) => {
    const app = await startApp(t, { guardrails: { writeRateLimit: 1 } });

    await createRecipe(app, recipe('Leek and Potato Soup'));
    await post(app, recipe('Carrot Soup'));

    assert.deepEqual(
      (await readRecipes(app)).map(({ name }) => name),
      ['Leek and Potato Soup'],
    );
  });

  it('counts against one address rather than against everyone', async (t) => {
    const app = await startApp(t, { guardrails: { writeRateLimit: 1 } });

    await post(app, recipe('Leek and Potato Soup'), { remoteAddress: '100.64.0.1' });
    const other = await post(app, recipe('Carrot Soup'), { remoteAddress: '100.64.0.2' });

    assert.equal(other.statusCode, 201);
  });

  it('leaves reads alone, however many arrive', async (t) => {
    const app = await startApp(t, { guardrails: { writeRateLimit: 1 } });
    await createRecipe(app, recipe('Leek and Potato Soup'));

    // The client re-reads the whole state after every change and polls on top of that, so a read
    // counted against a write budget would rate-limit the app out of its own refresh.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({ method: 'GET', url: '/api/state' });
      assert.equal(response.statusCode, 200, `read ${attempt} was refused`);
    }
  });

  it('gives the budget back when the window passes', async (t) => {
    const writeRateWindowMs = 250;
    const app = await startApp(t, { guardrails: { writeRateLimit: 1, writeRateWindowMs } });
    await createRecipe(app, recipe('Leek and Potato Soup'));
    assert.equal((await post(app, recipe('Carrot Soup'))).statusCode, 429);

    await delay(writeRateWindowMs * 3);

    // Otherwise the first burst of abuse would lock a shared address out for good, and the window
    // would be a number nothing reads.
    assert.equal((await post(app, recipe('Tomato Soup'))).statusCode, 201);
  });
});

describe('finding the client address behind a proxy', () => {
  // One address reaching the process, two visitors behind it. Whether they share a rate-limit
  // bucket is the whole of whether "per-IP" is true on the Demo Variant, where CloudFront is always
  // the last hop.
  const asVisitor = (app, address) =>
    post(app, recipe(`Soup for ${address}`), {
      remoteAddress: '10.0.0.1',
      headers: { 'x-forwarded-for': address },
    });

  it('counts the forwarded address when the deployment trusts the proxy in front of it', async (t) => {
    const app = await startApp(t, { guardrails: { writeRateLimit: 1, trustProxy: true } });

    await asVisitor(app, '203.0.113.1');
    const second = await asVisitor(app, '203.0.113.2');

    assert.equal(second.statusCode, 201);
  });

  it('ignores the header when nothing it controls sets one', async (t) => {
    const app = await startApp(t, { guardrails: { writeRateLimit: 1, trustProxy: false } });

    // A caller reaching the process directly can write this header itself, so trusting it here
    // would let one script claim a fresh address per request and never be limited at all.
    await asVisitor(app, '203.0.113.1');
    const second = await asVisitor(app, '203.0.113.2');

    assert.equal(second.statusCode, 429);
  });
});

describe('limiting the request body size', () => {
  // Comfortably under a Recipe at the per-Recipe Ingredient cap, so the cap is what refuses an
  // oversized Recipe and this refuses a payload that is not a Recipe at all.
  const SMALL_LIMIT = 512;

  const oversizedRecipe = () => ({
    ...recipe('Everything'),
    ingredients: Array.from({ length: RECIPE_INGREDIENTS_MAX }, (_, index) => ({
      name: `Ingredient ${index}`,
    })),
  });

  it('refuses a body over the limit', async (t) => {
    const app = await startApp(t, { guardrails: { bodyLimitBytes: SMALL_LIMIT } });

    const response = await post(app, oversizedRecipe());

    assert.equal(response.statusCode, 413);
  });

  it('refuses it before parsing it', async (t) => {
    const app = await startApp(t, { guardrails: { bodyLimitBytes: SMALL_LIMIT } });

    // Not JSON at all. A parser that ran first would answer 400; 413 is what says the size was
    // checked before anything read the bytes.
    const response = await post(app, '<'.repeat(SMALL_LIMIT * 2), {
      headers: { 'content-type': 'application/json' },
    });

    assert.equal(response.statusCode, 413);
  });

  it('writes nothing for the body it refused', async (t) => {
    const app = await startApp(t, { guardrails: { bodyLimitBytes: SMALL_LIMIT } });

    await post(app, oversizedRecipe());

    assert.deepEqual(await readRecipes(app), []);
  });

  it('accepts a body under the limit', async (t) => {
    const app = await startApp(t, { guardrails: { bodyLimitBytes: SMALL_LIMIT } });

    const created = await createRecipe(app, recipe('Leek and Potato Soup'));

    assert.equal(created.name, 'Leek and Potato Soup');
  });
});

describe('pinning CORS to the configured origin', () => {
  const preflight = (app, origin) =>
    app.inject({
      method: 'OPTIONS',
      url: '/api/recipes',
      headers: { origin, 'access-control-request-method': 'POST' },
    });

  it('answers the configured origin, and says so', async (t) => {
    const app = await startApp(t, { guardrails: { corsOrigin: ORIGIN } });

    const response = await post(app, recipe('Leek and Potato Soup'), {
      headers: { origin: ORIGIN },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['access-control-allow-origin'], ORIGIN);
  });

  it('clears a preflight from the configured origin', async (t) => {
    const app = await startApp(t, { guardrails: { corsOrigin: ORIGIN } });

    const response = await preflight(app, ORIGIN);

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-origin'], ORIGIN);
  });

  it('refuses another origin outright', async (t) => {
    const app = await startApp(t, { guardrails: { corsOrigin: ORIGIN } });

    const response = await post(app, recipe('Leek and Potato Soup'), {
      headers: { origin: 'https://someone-elses-site.example' },
    });

    // Omitting the header would leave the browser to block the read while the write still landed.
    // Refusing is what makes the API not a free backend for another site.
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.deepEqual(await readRecipes(app), []);
  });

  it('refuses a preflight from another origin', async (t) => {
    const app = await startApp(t, { guardrails: { corsOrigin: ORIGIN } });

    const response = await preflight(app, 'https://someone-elses-site.example');

    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  });

  it('leaves a request carrying no Origin alone', async (t) => {
    const app = await startApp(t, { guardrails: { corsOrigin: ORIGIN } });

    // The container health check, a curl, and every same-origin GET arrive without one. There is
    // no cross-origin request to refuse if no browser attached an origin to it.
    const response = await post(app, recipe('Leek and Potato Soup'));

    assert.equal(response.statusCode, 201);
  });
});

describe('capping the total number of Recipes', () => {
  const CAP = 3;
  // Derived from the cap rather than a list matching it by hand, so moving CAP cannot leave these
  // tests quietly asserting against an instance that never filled up.
  const fillToCapacity = async (app) => {
    for (let nth = 0; nth < CAP; nth += 1) {
      await createRecipe(app, recipe(`Soup ${nth}`));
    }
  };

  it('accepts the Recipe that reaches the cap', async (t) => {
    const app = await startApp(t, { guardrails: { recipesMax: CAP } });

    await fillToCapacity(app);

    assert.equal((await readRecipes(app)).length, CAP);
  });

  it('refuses the Recipe after it', async (t) => {
    const app = await startApp(t, { guardrails: { recipesMax: CAP } });
    await fillToCapacity(app);

    const response = await post(app, recipe('Onion Soup'));

    assert.equal(response.statusCode, 409);
    assert.equal((await readRecipes(app)).length, CAP);
  });

  it('tells the cook what the ceiling is rather than just refusing', async (t) => {
    const app = await startApp(t, { guardrails: { recipesMax: CAP } });
    await fillToCapacity(app);

    const response = await post(app, recipe('Onion Soup'));

    assert.match(response.json().message, new RegExp(String(CAP)));
  });

  it('stays exact when two creates race for the last place', async (t) => {
    const app = await startApp(t, { guardrails: { recipesMax: CAP } });
    for (let nth = 0; nth < CAP - 1; nth += 1) {
      await createRecipe(app, recipe(`Soup ${nth}`));
    }

    // A cap that counts and then inserts without serializing lets both of these through, which is
    // the difference between an exact ceiling and an approximate one.
    const responses = await Promise.all([
      post(app, recipe('Tomato Soup')),
      post(app, recipe('Onion Soup')),
    ]);

    assert.deepEqual(
      responses.map((response) => response.statusCode).sort(),
      [201, 409],
    );
    assert.equal((await readRecipes(app)).length, CAP);
  });
});

describe('reading every limit from configuration', () => {
  const env = {
    DATABASE_URL: 'postgres://app@db:5432/meal_prep',
    CORS_ORIGIN: 'https://meal-prep.example',
    BODY_LIMIT_BYTES: '4096',
    WRITE_RATE_LIMIT: '7',
    WRITE_RATE_WINDOW_MS: '15000',
    RECIPES_MAX: '250',
    TRUST_PROXY: 'true',
  };

  it('takes each limit from the environment the wrapper sets', () => {
    assert.deepEqual(readServerConfig(env).guardrails, {
      corsOrigin: 'https://meal-prep.example',
      bodyLimitBytes: 4096,
      writeRateLimit: 7,
      writeRateWindowMs: 15000,
      recipesMax: 250,
      trustProxy: true,
    });
  });

  it('reads a limit left blank as one the wrapper never set', () => {
    // How an unset limit actually arrives: compose.yaml passes every one of these through, and
    // Compose renders a variable nobody set as an empty string rather than omitting it.
    const blank = {
      ...env,
      BODY_LIMIT_BYTES: '',
      WRITE_RATE_LIMIT: '',
      WRITE_RATE_WINDOW_MS: '',
      RECIPES_MAX: '',
      TRUST_PROXY: '',
    };
    const { DATABASE_URL, CORS_ORIGIN } = env;

    assert.deepEqual(
      readServerConfig(blank).guardrails,
      readServerConfig({ DATABASE_URL, CORS_ORIGIN }).guardrails,
    );
  });

  it('refuses to start without an allowed origin', () => {
    const { CORS_ORIGIN, ...withoutOrigin } = env;

    assert.throws(() => readServerConfig(withoutOrigin), /CORS_ORIGIN/);
  });

  it('refuses a limit that is not a number', () => {
    assert.throws(() => readServerConfig({ ...env, RECIPES_MAX: 'lots' }), /RECIPES_MAX/);
  });
});
