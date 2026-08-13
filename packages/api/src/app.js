import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ajvOptions } from '@meal-prep/shared';
import { defaultWebDist } from './config.js';
import { registerRecipeRoutes } from './recipes.js';
import { readState, stateResponse } from './state.js';

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

export function buildApp({ pool, staticRoot = defaultWebDist, logger = true }) {
  // The Add form compiles the same schema with the same options, so neither side is the stricter
  // of the two.
  const app = Fastify({ logger, ajv: { customOptions: ajvOptions } });
  app.decorate('db', pool);

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

  if (bundleExists(staticRoot)) {
    app.register(fastifyStatic, { root: staticRoot });
  } else {
    // Tests build apps with no bundle on purpose. A deployment cannot: see the entrypoint.
    app.log.warn(`no frontend bundle at ${staticRoot} - this origin will serve the API only`);
  }

  return app;
}
