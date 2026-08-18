// Configuration is read from the environment and nothing else. There is no MODE variable and no
// variant flag: both Variants run this same code and differ only in the values they pass in
// (ADR-0002). The surface here is deliberately exactly what the wrappers set - nothing is
// configurable that no wrapper configures.

import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');

export const defaultWebDist = resolve(packageRoot, '../web/dist');
export const migrationsDir = resolve(packageRoot, 'migrations');

// Where the build step writes the recorded Seed (ADR-0009). Vite copies its public directory into
// the bundle verbatim, so the recording lands beside index.html with no build configuration and
// without being imported into a module: the frontend asks for it only once the live call has
// already failed, so it costs nothing at first paint.
export const recordedSeedFile = resolve(packageRoot, '../web/public/recorded-seed.json');

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

// A switch or a count of proxy hops, because the two Variants disagree about their proxies rather
// than about the app (ADR-0008). Anything else throws instead of falling back to false: this is the
// value the write rate limiter keys on, and a limiter keyed on the wrong address is worse than no
// limiter because it answers 201 and 429 as though it were working (ADR-0010). A deployment that
// meant to count hops and typed something Number() dislikes should not start.
function flagOrHopCount(env, name, fallback) {
  const value = setting(env, name);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;

  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(`${name} must be "true", "false", or a hop count of at least 1, got "${value}"`);
  }
  return hops;
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
    // Where in X-Forwarded-For the visitor's address is, which is what rate limiting keys on. Off by
    // default, because a caller reaching the process directly writes that header itself and could
    // otherwise claim a fresh address per request.
    //
    // `true` reads the leftmost entry, and is only correct in front of a proxy that replaces the
    // header rather than appending to it - the Homelab Variant's `tailscale serve` does. A count
    // instead names how many proxies stand in front, and resolves that many hops inward from the
    // socket, discarding everything the caller wrote. The Demo Variant sets 2 for CloudFront and the
    // reverse proxy behind it, both of which append (ADR-0008). Which value is right is a fact about
    // the deployment's proxies, so the tests state the chain rather than the arithmetic.
    trustProxy: flagOrHopCount(env, 'TRUST_PROXY', false),
  };
}

/** For the long-running API process, which connects as the restricted role. */
export function readServerConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    port: port(env, 'PORT', 8080),
    logLevel: env.LOG_LEVEL ?? 'info',
    // A line of text the deployment wants every visitor to read, or nothing. The Demo Variant sets
    // it to say the data is a fixture; the Homelab Variant sets nothing and so shows nothing, which
    // is an unset variable rather than a branch (ADR-0002). The name deliberately describes the
    // banner rather than the Variant: `DEMO_NOTICE` would be a mode flag wearing a string's
    // clothes, and the next feature would ask to read it.
    //
    // Not a guardrail. Nothing here bounds what a visitor can cost, so it would only be there for
    // the company (ADR-0001). Null rather than undefined because it travels in the payload, where
    // "nobody configured one" has to be a value the schema can name.
    notice: setting(env, 'SITE_NOTICE') ?? null,
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
