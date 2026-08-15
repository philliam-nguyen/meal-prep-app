// The Demo Variant's scheduled restore: empties the database and loads the Seed back into it. Runs
// to completion and exits, so a scheduler can hold it to an exit code.
//
// This is the API's own image with a different command, the way the migration step already is
// (ADR-0002). There is no second artifact to keep in step and no database client to install: the
// restore reaches Postgres through the same pool the API does.
//
// The Homelab Variant never schedules this. It seeds nothing, and running this against it would
// empty the real collection.

import { readSeedConfig } from './config.js';
import { createPool } from './db.js';
import { restoreSeed } from './seeding.js';

const log = (message) => console.log(`seed: ${message}`);

const config = readSeedConfig();
const pool = createPool(config.databaseUrl, 'meal-prep-seed');

try {
  const { recipes, ingredients, staples } = await restoreSeed({
    pool,
    guardrails: config.guardrails,
    log,
  });
  log(`${recipes} Recipes, ${ingredients} Ingredients, ${staples} of them Staples`);
} catch (error) {
  // The whole error, not just its message: this runs unattended and its log is the only account.
  console.error('seed failed');
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
