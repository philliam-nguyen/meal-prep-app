import { buildApp, bundleExists } from './app.js';
import { defaultWebDist, readServerConfig } from './config.js';
import { createPool } from './db.js';

const config = readServerConfig();

// Serving the frontend from this origin is half of what this process is for, so a missing bundle is
// a broken deployment rather than a degraded one. Fail here instead of answering 404 for the app.
if (!bundleExists(defaultWebDist)) {
  console.error(`no frontend bundle at ${defaultWebDist}. Run "npm run build" before starting.`);
  process.exit(1);
}

const pool = createPool(config.databaseUrl);
const app = buildApp({
  pool,
  staticRoot: defaultWebDist,
  logger: { level: config.logLevel },
});

// Compose and the Demo Variant's scheduler both stop this with a signal, so draining beats being
// killed mid-request. Binds every interface because it always runs in a container.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  });
}

try {
  await app.listen({ host: '0.0.0.0', port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'the API could not start');
  process.exit(1);
}
