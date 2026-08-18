// A Postgres that lives for the length of one command: started from the pinned image, migrated from
// empty, and handed the restricted role the API connects as alongside the owner's.
//
// The suite has booted one per run since ADR-0005, and the Seed recording needs exactly the same
// database for exactly the same reason. This is that boot, in one place, so the recording is the
// suite's database rather than a second way of getting one. Two of them would be free to disagree
// about which image, which migrations or which grants the recording was taken against, and the
// recording would then describe a database no deployment runs.
//
// `@testcontainers/postgresql` is a devDependency, so nothing the server or the restore imports may
// reach this file. It is build-and-test machinery that happens to live beside them, here rather than
// under test/ because the build step that needs it is not a test.

import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrationsDir } from './config.js';
import { runMigrations } from './migrations.js';
import { ensureAppRole } from './roles.js';

// Pinned to match compose.yaml, so a green suite says something about what the stack runs.
const POSTGRES_IMAGE = 'postgres:17-alpine';

const OWNER_ROLE = 'meal_prep_owner';
export const APP_ROLE = 'meal_prep_app';
const DATABASE = 'meal_prep';

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

/**
 * Starts the container, applies every migration as the owner and creates the restricted role. The
 * caller gets both connection strings and the means to stop it.
 *
 * Applying the migrations here rather than leaving them to the caller is what makes a command that
 * boots at all proof that they apply from empty, and what makes a missing grant surface on the first
 * query that needs it rather than at deployment.
 */
export async function startThrowawayPostgres() {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(DATABASE)
    .withUsername(OWNER_ROLE)
    .withPassword(throwawayPassword())
    .start();

  const ownerUrl = container.getConnectionUri();
  const appPassword = throwawayPassword();

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await runMigrations({ client, dir: migrationsDir });
    await ensureAppRole({ client, role: APP_ROLE, password: appPassword });
  } finally {
    await client.end();
  }

  return {
    ownerUrl,
    appUrl: connectionUriAs(ownerUrl, APP_ROLE, appPassword),
    appRole: APP_ROLE,
    stop: () => container.stop(),
  };
}
