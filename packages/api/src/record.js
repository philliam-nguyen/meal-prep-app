// The build step that records the Seed. Starts a throwaway Postgres, loads the fixture into it
// through the API's own routes, reads `GET /api/state` back out and writes the body into the
// frontend's public directory, where Vite carries it into the bundle (ADR-0009).
//
// Run by `npm run build` at the root, ahead of Vite, because staleness is the risk this file exists
// against. The recording is dead code until an outage: local development, the suite and every normal
// page load use the live API, so a Seed edited without a regeneration would go unnoticed until the
// one moment the fallback is all a Reviewer has. Regenerating has to be something the build does
// rather than something a person remembers.
//
// It needs a Docker daemon and therefore cannot run inside the image build, which has none. The
// image takes the recording in with its build context, so the file is committed and this command is
// what keeps it honest.
//
// Deterministic by construction: a fresh container starts every sequence at one, `restart identity`
// keeps it there across the restore, and the one wall-clock field in the payload is replaced with a
// sentinel. So a rebuild that changes the file is a Seed that changed.

import { writeFile } from 'node:fs/promises';
import { readSeedConfig, recordedSeedFile } from './config.js';
import { createPool } from './db.js';
import { recordSeed, serializeRecording } from './recording.js';
import { startThrowawayPostgres } from './throwawayPostgres.js';

const log = (message) => console.log(`record: ${message}`);

// Guardrails come from the environment the way the scheduled restore reads them, so a Seed the
// deployment would refuse fails here rather than at the first restore. The connection string is the
// one thing the environment cannot supply: the database is started by this command and thrown away
// by it (ADR-0007).
const configFor = (databaseUrl) =>
  readSeedConfig({ ...process.env, SEED_DATABASE_URL: databaseUrl });

log('starting a throwaway Postgres');
const postgres = await startThrowawayPostgres();
const pool = createPool(postgres.ownerUrl, 'meal-prep-record');

try {
  const recorded = await recordSeed({ pool, guardrails: configFor(postgres.ownerUrl).guardrails });
  const bytes = serializeRecording(recorded);
  await writeFile(recordedSeedFile, bytes);
  log(`wrote ${recorded.recipes.length} Recipes to ${recordedSeedFile}, ${bytes.length} bytes`);
} catch (error) {
  // The whole error, not just its message. This runs in a build, where the log is the only account
  // of why the bundle it was going to produce has no recording in it.
  console.error('record failed');
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
  await postgres.stop();
}
