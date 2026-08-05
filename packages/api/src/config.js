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

/** For the long-running API process, which connects as the restricted role. */
export function readServerConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    port: port(env, 'PORT', 8080),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}

/** For the migration command, the only thing that connects as the owner role. */
export function readMigrateConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'MIGRATION_DATABASE_URL'),
    appRole: env.APP_DB_ROLE ?? 'meal_prep_app',
    appPassword: required(env, 'APP_DB_PASSWORD'),
    migrationsDir,
  };
}
