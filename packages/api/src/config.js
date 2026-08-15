// Configuration is read from the environment and nothing else. There is no MODE variable and no
// variant flag: both Variants run this same code and differ only in the values they pass in
// (ADR-0002). The surface here is deliberately exactly what the wrappers set - nothing is
// configurable that no wrapper configures.

import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');

export const defaultWebDist = resolve(packageRoot, '../web/dist');
export const migrationsDir = resolve(packageRoot, 'migrations');

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function port(env, name, fallback) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`${name} must be a port number, got "${env[name]}"`);
  }
  return value;
}

// Compose passes an unset variable through as an empty string, so a limit nobody set arrives as ""
// rather than as nothing. Both mean "not configured", and the alternative is repeating every
// default in compose.yaml where it can drift from the one here.
const setting = (env, name) => (env[name] === '' ? undefined : env[name]);

function positiveInteger(env, name, fallback) {
  const value = Number(setting(env, name) ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a whole number of at least 1, got "${env[name]}"`);
  }
  return value;
}

function flag(env, name, fallback) {
  const value = setting(env, name);
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be "true" or "false", got "${value}"`);
  }
  return value === 'true';
}

/**
 * The boundary guardrails (ADR-0001), every one of them a value rather than a branch. Both Variants
 * run this code and apply all of it; the Demo Variant simply passes tighter numbers (ADR-0002).
 * Moving a limit is an environment change and never an edit.
 */
function guardrails(env) {
  return {
    // No default. "Allow everything" hands the API to any site that asks, and "allow nothing"
    // refuses the app's own writes, because a browser attaches an Origin to a same-origin POST too.
    // Neither is a safe thing to fall back to, so the wrapper has to name the origin.
    corsOrigin: required(env, 'CORS_ORIGIN'),
    // A Recipe at the per-Recipe Ingredient cap is a few kilobytes, so this is generous for the
    // largest legitimate write while keeping a payload from being a resource cost in itself.
    bodyLimitBytes: positiveInteger(env, 'BODY_LIMIT_BYTES', 64 * 1024),
    // A write per second sustained, which is well past the pace of a cook ticking items down an
    // aisle. Bounding a script is the row caps' job; this only has to slow one down.
    writeRateLimit: positiveInteger(env, 'WRITE_RATE_LIMIT', 60),
    writeRateWindowMs: positiveInteger(env, 'WRITE_RATE_WINDOW_MS', 60_000),
    // Headroom over a personal collection, and the absolute ceiling on what a visitor to the Demo
    // Variant can cost by scripting inserts.
    recipesMax: positiveInteger(env, 'RECIPES_MAX', 500),
    // Rate limiting keys on the client address, which is the last hop unless this is on: behind the
    // Demo Variant's CDN every visitor would otherwise share one bucket. Off by default, because
    // trusting a forwarded header from a client that reaches the process directly lets anyone claim
    // any address and defeats the limit from the other side.
    trustProxy: flag(env, 'TRUST_PROXY', false),
  };
}

/** For the long-running API process, which connects as the restricted role. */
export function readServerConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    port: port(env, 'PORT', 8080),
    logLevel: env.LOG_LEVEL ?? 'info',
    guardrails: guardrails(env),
  };
}

/** For the migration command, which connects as the owner role. */
export function readMigrateConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'MIGRATION_DATABASE_URL'),
    appRole: env.APP_DB_ROLE ?? 'meal_prep_app',
    appPassword: required(env, 'APP_DB_PASSWORD'),
    migrationsDir,
  };
}

// The restore binds no socket and answers no browser, so the one guardrail with no default is given
// a value here rather than asked of whoever schedules the task. Its requests are injected and carry
// no Origin, which is the header both the origin hook and the CORS plugin decide on.
const SEED_ORIGIN = 'seed://restore';

// The one limit the restore is not held to. Rate limiting bounds how fast one address may write,
// which says nothing about whether the Seed is legitimate data, and a fixture holding more Recipes
// than a visitor may write in a window would otherwise refuse its own restore. Every limit that does
// describe the data - the Recipe cap, the Ingredient ceiling, the body limit, every field rule - is
// read from the environment below, so a Seed the deployment would not accept fails the restore.
const SEED_WRITE_RATE_LIMIT = Number.MAX_SAFE_INTEGER;

/**
 * For the Seed restore, which connects as the owner role because it empties the database before it
 * loads, and the API's role deliberately cannot.
 */
export function readSeedConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'SEED_DATABASE_URL'),
    guardrails: {
      ...guardrails({ ...env, CORS_ORIGIN: SEED_ORIGIN }),
      writeRateLimit: SEED_WRITE_RATE_LIMIT,
    },
  };
}
