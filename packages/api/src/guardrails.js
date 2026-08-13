// The guardrails that sit in front of every route (ADR-0001), registered in one place so a route
// added later inherits them without having to opt in. Nothing here reads which Variant is running:
// these are configuration values applied unconditionally, which is what leaves one code path to
// reason about instead of two (ADR-0002).
//
// The absolute ceiling on total Recipes is the other half of ADR-0001 and lives in recipes.js, with
// the write it bounds, because it counts rows rather than reading a request.

import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';

// Writes only. A read costs a query; a write costs a row, and the row is what ADR-0001 defends. The
// client also reads far more often than it writes - it re-reads the whole state after every change,
// and the freshness design puts a poll on top of that - so counting reads would rate-limit the app
// out of its own refresh.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Awaited, and awaited before any route is registered. @fastify/rate-limit attaches itself through
 * an `onRoute` hook, which only fires for routes added after the plugin has finished loading, so a
 * route registered while this is still pending is a route the limit silently never covers.
 */
export async function registerGuardrails(app, { corsOrigin, writeRateLimit, writeRateWindowMs }) {
  // Added before the CORS plugin, so it runs before it. The plugin's own answer to an origin it
  // does not recognize is to omit the header and serve the request anyway, which leaves the browser
  // blocking a response whose write has already landed. Refusing is what keeps the API from being a
  // free backend for another site.
  //
  // A request carrying no Origin is not a cross-origin request. The container health check, a curl
  // and every same-origin GET arrive without one, so refusing those would take the app down.
  app.addHook('onRequest', async (request, reply) => {
    const { origin } = request.headers;
    if (origin === undefined || origin === corsOrigin) return;

    request.log.warn({ path: request.url }, 'refused a request from an origin that is not allowed');
    return reply.code(403).send({ message: 'This API does not answer another site.' });
  });

  await app.register(fastifyCors, { origin: corsOrigin });

  await app.register(fastifyRateLimit, {
    max: writeRateLimit,
    timeWindow: writeRateWindowMs,
    // Keyed on the client address by default. Whether that address is the real client or the last
    // proxy in front of it is the trustProxy setting's business, not this plugin's.
    allowList: (request) => !WRITE_METHODS.has(request.method),
  });
}
