// One throwaway Postgres for the whole run (ADR-0005). Migrations are applied as the owner role,
// the restricted role the API connects as is created here, and tests are handed only the restricted
// connection string. So the suite proves the migrations apply from empty and that the API's grants
// are sufficient by booting at all, rather than by tests somebody remembers to write.

import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { runMigrations } from '../src/migrations.js';
import { ensureAppRole } from '../src/roles.js';
import { migrationsDir } from '../src/config.js';

// Pinned to match compose.yaml, so a green suite says something about what the stack runs.
const POSTGRES_IMAGE = 'postgres:17-alpine';

const OWNER_ROLE = 'meal_prep_owner';
const APP_ROLE = 'meal_prep_app';
const DATABASE = 'meal_prep';

let container;

function throwawayPassword() {
  // URL-safe so it survives interpolation into a connection string unencoded.
  return randomBytes(24).toString('hex');
}

function connectionUriAs(baseUri, role, password) {
  const uri = new URL(baseUri);
  uri.username = role;
  uri.password = password;
  return uri.toString();
}

export async function globalSetup() {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(DATABASE)
    .withUsername(OWNER_ROLE)
    .withPassword(throwawayPassword())
    .start();

  const ownerUri = container.getConnectionUri();
  const appPassword = throwawayPassword();

  const client = new pg.Client({ connectionString: ownerUri });
  await client.connect();
  try {
    await runMigrations({ client, dir: migrationsDir });
    await ensureAppRole({ client, role: APP_ROLE, password: appPassword });
  } finally {
    await client.end();
  }

  process.env.TEST_OWNER_DATABASE_URL = ownerUri;
  process.env.TEST_APP_DATABASE_URL = connectionUriAs(ownerUri, APP_ROLE, appPassword);
  process.env.TEST_APP_ROLE = APP_ROLE;
}

export async function globalTeardown() {
  await container?.stop();
}
