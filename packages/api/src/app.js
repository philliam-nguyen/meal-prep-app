import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ajvOptions } from '@meal-prep/shared';
import { defaultWebDist } from './config.js';
import { registerGuardrails } from './guardrails.js';
import { registerIngredientRoutes } from './ingredients.js';
import { registerRecipeRoutes } from './recipes.js';
import { readState, stateResponse } from './state.js';
import { registerVersionRoute } from './version.js';

// The frontend is served from the API's own origin in both Variants, which is what lets it call
// relative paths and carry no per-Variant configuration (ADR-0002). API routes sit under /api so
// the Demo Variant's CDN can route by path to the same routes the homelab serves directly.

const healthResponse = {
  type: 'object',
  required: ['status', 'database'],
  additionalProperties: false,
  properties: {
    status: { type: 'string' },
    database: { type: 'string' },
  },
};

/** Whether a directory holds a built frontend. The entrypoint refuses to start without one. */
export const bundleExists = (staticRoot) => existsSync(join(staticRoot, 'index.html'));

// Checked by name rather than for the object's presence. A guardrails object missing one key hands
// Fastify an undefined bodyLimit, which it silently replaces with its own default - a guardrail off
// with nothing to show for it, which is the failure ADR-0001 is least able to tolerate.
const REQUIRED_GUARDRAILS = [
  'corsOrigin',
  'bodyLimitBytes',
  'writeRateLimit',
  'writeRateWindowMs',
  'recipesMax',
  'trustProxy',
];

// Async because the guardrails have to finish loading before the first route is registered; see
// registerGuardrails. Every caller awaits it.
export async function buildApp({ pool, staticRoot = defaultWebDist, logger = true, guardrails }) {
  const missing = REQUIRED_GUARDRAILS.filter((limit) => guardrails?.[limit] === undefined);
  if (missing.length > 0) {
    throw new Error(`buildApp needs every guardrail, missing: ${missing.join(', ')}`);
  }

  const app = Fastify({
    // The Add form compiles the same schema with the same options, so neither side is the stricter
    // of the two.
    ajv: { customOptions: ajvOptions },
    logger,
    // Enforced against content-length before a parser is chosen, so an oversized body is refused
    // rather than read.
    bodyLimit: guardrails.bodyLimitBytes,
    // What makes request.ip the visitor rather than the last proxy in front of them, and so what
    // makes rate limiting per-address wherever the deployment puts a proxy in the path. Passed
    // through as read: Fastify takes the switch and the hop count alike, and config.js is where the
    // choice between them is explained.
    trustProxy: guardrails.trustProxy,
  });
  app.decorate('db', pool);
  // Read by the write paths that enforce a row cap, in the same way they reach the pool.
  app.decorate('guardrails', guardrails);

  // Before every route below, so a route added later is covered without opting in.
  await registerGuardrails(app, guardrails);

  // No read from this API may be served from a cache. The version endpoint exists to change, and the
  // state payload is what a changed version sends the client back for, so either one held by a
  // browser's own heuristics or by the Demo Variant's CDN default breaks freshness silently: the
  // poll keeps running and keeps concluding that nothing has moved. Nothing else here sets a cache
  // header, and a response with none is exactly the one an intermediary is free to guess about.
  //
  // Scoped to /api so the built frontend keeps whatever caching its hashed filenames earn.
  app.addHook('onSend', async (request, reply) => {
    if (request.method === 'GET' && request.url.startsWith('/api/')) {
      reply.header('cache-control', 'no-store');
    }
  });

  app.get(
    '/api/health',
    { schema: { response: { 200: healthResponse, 503: healthResponse } } },
    async (request, reply) => {
      try {
        await pool.query('select 1');
      } catch (cause) {
        request.log.error({ err: cause }, 'health check could not reach the database');
        return reply.code(503).send({ status: 'error', database: 'down' });
      }
      return { status: 'ok', database: 'up' };
    },
  );

  // One request for the whole first paint, replacing the four parallel spreadsheet calls the
  // Sheets-era client opened on load.
  app.get('/api/state', { schema: { response: { 200: stateResponse } } }, async () =>
    readState(pool),
  );

  registerRecipeRoutes(app);
  registerIngredientRoutes(app);
  registerVersionRoute(app);

  if (bundleExists(staticRoot)) {
    app.register(fastifyStatic, { root: staticRoot });
  } else {
    // Tests build apps with no bundle on purpose. A deployment cannot: see the entrypoint.
    app.log.warn(`no frontend bundle at ${staticRoot} - this origin will serve the API only`);
  }

  return app;
}
