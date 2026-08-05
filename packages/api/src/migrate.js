// The only thing that connects as the owner role: applies pending migrations, then makes sure the
// restricted role the API uses exists with the right grants. Runs to completion and exits, so
// Compose can gate the API on it and the Demo Variant can schedule it.

import pg from 'pg';
import { readMigrateConfig } from './config.js';
import { runMigrations } from './migrations.js';
import { ensureAppRole } from './roles.js';

const log = (message) => console.log(`migrate: ${message}`);

const config = readMigrateConfig();
const client = new pg.Client({
  connectionString: config.databaseUrl,
  application_name: 'meal-prep-migrate',
});

try {
  await client.connect();
  const { applied, alreadyApplied } = await runMigrations({
    client,
    dir: config.migrationsDir,
    log,
  });
  await ensureAppRole({
    client,
    role: config.appRole,
    password: config.appPassword,
    log,
  });
  log(`${applied.length} applied, ${alreadyApplied.length} already present`);
} catch (error) {
  // The whole error, not just its message: this runs unattended and its log is the only account.
  console.error('migrate failed');
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
