// The Operator's export back to the spreadsheet: read the database, show what would change in the
// spreadsheet, and write only what a person said yes to (ticket 18).
//
// This is the API's own image with a different command, the way the migration step and the Seed
// restore are (ADR-0002). It runs to completion and exits.
//
// It is not the backup and must not be treated as one. Its recovery point is the last time somebody
// approved a run, and the tabs it writes are lossy by design - no ids, no Recipe Ingredient rows, no
// foreign keys - so nothing loads back out of them. The backup is ticket 14's nightly dump, which
// runs unattended and keeps a month (docs/adr/0011-spreadsheet-export-is-a-convenience-copy.md).
//
// Nothing in the app or in either deployment depends on this running. No Compose service, no
// Terraform resource, no timer, no route. A spreadsheet that has not been exported to since March
// costs the deployment nothing at all.

import { createInterface } from 'node:readline/promises';
import { readExportConfig } from './config.js';
import { createPool } from './db.js';
import { readCredentials, sheetsClient } from './sheetsClient.js';
import { exportTabs, runExport } from './spreadsheetExport.js';
import { readState } from './state.js';

const log = (message) => console.log(`export: ${message}`);

// A preview and nothing else. The gate below already refuses to write without an answer, so this is
// for the Operator who wants to look without being asked, and for anywhere a prompt would be
// answered by an empty stdin.
const previewOnly = process.argv.includes('--dry-run');

/**
 * The gate. Types the whole word, because `y` is what a person presses to get a prompt off their
 * screen and this rewrites a copy they are keeping.
 *
 * A stdin that is not a terminal declines rather than blocking or reading whatever is piped in. That
 * makes the failure mode of every unattended context "nothing was written", which is the only safe
 * direction here: this command has no schedule and no caller but a person, so an approval that
 * arrived from somewhere else is a bug rather than consent.
 */
async function askTheOperator() {
  if (!process.stdin.isTTY) {
    log('stdin is not a terminal, so nobody can approve this. Nothing was written.');
    return false;
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question('Write these changes to the spreadsheet? Type yes: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    prompt.close();
  }
}

const config = readExportConfig();
const pool = createPool(config.databaseUrl, 'meal-prep-export');

try {
  const client = sheetsClient({
    spreadsheetId: config.spreadsheetId,
    credentials: await readCredentials(config.credentialsFile),
  });

  const { written } = await runExport({
    client,
    // The first-paint payload, rendered into tabs. Reading what the app reads is what keeps the
    // Shopping List in the spreadsheet the same Shopping List the app shows, rather than a second
    // implementation of the same rollup answering slightly differently (ADR-0009 records the same
    // reasoning for the recorded Seed).
    tabs: exportTabs(await readState(pool)),
    approve: previewOnly
      ? async () => {
          log('--dry-run: nothing was written.');
          return false;
        }
      : askTheOperator,
    log,
  });

  if (written.length > 0) log(`wrote ${written.join(', ')}`);
} catch (error) {
  // The whole error, not just its message. Half of what can go wrong here is a Google refusal
  // carrying its reason in a body, and the log is the only account of it.
  console.error('export failed');
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
