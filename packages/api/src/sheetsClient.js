// The live half of the Sheets seam: read a tab's values, replace a tab's values. Two methods, and
// nothing here knows what a Recipe is - spreadsheetExport.js decides what the rows say and whether
// they may be written, and this only carries them.
//
// Hand-rolled against the REST endpoints rather than through Google's client library. The library
// would be the only dependency in this project that the API image carries and never runs: the export
// is an operator command, the image is what both Variants deploy, and a few dozen lines of `fetch`
// against two documented endpoints is a smaller thing to own than tens of megabytes of transitive
// packages sitting in the image both Variants deploy for a command nobody schedules.
//
// There was no Sheets client to inherit. The Sheets-era app read four tabs from the browser with an
// API key and wrote through an Apps Script web app that was never committed (ADR-0004), so the write
// path here is new rather than recovered.
//
// Nothing in this file is covered by the suite, deliberately: it is glue over HTTP to a service the
// tests may not reach. What it is glue *for* - the snapshot, the diff and the approval gate - is
// tested against a fake standing in this file's place, and the Operator exercises this on the first
// run against a real spreadsheet.

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

// The narrowest scope that can write values. There is a read-only scope and it is no use here, and
// `drive.file` would additionally let this create spreadsheets, which it must never do: the target
// is a spreadsheet the Operator made and shared with the service account by hand, so a credential
// that cannot reach any other file is the point (ADR-0011).
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// A minute short of the hour Google grants, so a token that is about to expire is replaced rather
// than spent on a request that then has to be retried.
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

const base64url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

/**
 * The service account key file Google hands out, checked for the two fields that matter here rather
 * than parsed loosely. A key file pointed at the wrong JSON should say so now and not as a 401.
 */
export async function readCredentials(path) {
  const credentials = JSON.parse(await readFile(path, 'utf8'));
  for (const field of ['client_email', 'private_key']) {
    if (!credentials[field]) throw new Error(`${path} is not a service account key: no ${field}`);
  }
  return credentials;
}

/**
 * A signed assertion saying who this is and what it wants, which Google trades for an access token.
 *
 * This is the whole of the authentication. There is no interactive consent and no refresh token to
 * store, because the caller is a service account rather than a person: the private key in the key
 * file is the credential, and it never leaves the machine the export runs on.
 */
function assertion({ client_email: clientEmail, private_key: privateKey }) {
  const issued = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issued,
      exp: issued + TOKEN_LIFETIME_SECONDS,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claim}`).sign(privateKey);
  return `${header}.${claim}.${base64url(signature)}`;
}

/** The whole body on a refusal, because a Google error says which of a dozen things went wrong. */
async function ok(response, what) {
  if (response.ok) return response;
  throw new Error(`${what} failed with ${response.status}: ${await response.text()}`);
}

function tokens(credentials) {
  let held;
  return async () => {
    if (held && held.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) return held.token;

    const response = await ok(
      await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: assertion(credentials),
        }),
      }),
      'the access token request',
    );

    const { access_token: token, expires_in: seconds } = await response.json();
    held = { token, expiresAt: Date.now() + seconds * 1000 };
    return token;
  };
}

// A tab name inside a range is quoted, and a quote inside the name is doubled. Every tab this writes
// is named by a constant in spreadsheetExport.js, so this is here for the tab the Operator renamed
// rather than for anything a cook can type.
const range = (title) => `'${title.replaceAll("'", "''")}'`;

// Always `stringValue`, never a formula. Every cell this writes is a value the database holds, and a
// cell entered as text is a cell an Aisle reading "=IMPORTRANGE(...)" cannot turn into one. The
// export renders numbers as strings for the same reason the diff compares strings: Sheets hands its
// own rendering back, and a number written here would report a change on every run.
const cellData = (value) => (value === '' ? {} : { userEnteredValue: { stringValue: value } });

/**
 * Reads and replaces whole tabs of one spreadsheet as a service account.
 *
 * `readTab` answers `[]` for a tab the spreadsheet does not have, rather than throwing: a first run
 * has none of them, and the export's answer to that is a diff full of added rows for the Operator to
 * approve. `writeTab` is what creates the tab, so no tab comes into existence before an approval.
 */
export function sheetsClient({ spreadsheetId, credentials }) {
  const accessToken = tokens(credentials);

  const call = async (path, { method = 'GET', body } = {}) => {
    const response = await fetch(`${SHEETS_URL}/${spreadsheetId}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response;
  };

  const sheetIds = async () => {
    const response = await ok(
      await call('?fields=sheets.properties(sheetId,title)'),
      'reading the spreadsheet',
    );
    const { sheets = [] } = await response.json();
    return new Map(sheets.map(({ properties }) => [properties.title, properties.sheetId]));
  };

  return {
    async readTab(title) {
      const response = await call(`/values/${encodeURIComponent(range(title))}`);
      // The one refusal that is an answer rather than a failure: a range naming a tab that is not
      // there. Matched on Google's own wording rather than on the status, because a 400 also covers
      // a malformed request, and treating every 400 as "empty tab" would turn a bug in this file
      // into a diff proposing to add every row the spreadsheet already has.
      if (response.status === 400) {
        const detail = await response.text();
        if (detail.includes('Unable to parse range')) return [];
        throw new Error(`reading ${title} failed with 400: ${detail}`);
      }
      const { values = [] } = await (await ok(response, `reading ${title}`)).json();
      return values;
    },

    /**
     * Replaces everything the tab holds, in one request.
     *
     * `updateCells` over a range with no end, rather than a clear followed by a write: the range the
     * rows do not cover is cleared by the same request that fills the rest, so there is no moment
     * where the tab is empty and no failure that can leave it that way. A copy the Operator trusts
     * cannot have a window in it where it says nothing.
     */
    async writeTab(title, rows) {
      let sheetId = (await sheetIds()).get(title);
      if (sheetId === undefined) {
        await ok(
          await call(':batchUpdate', {
            method: 'POST',
            body: { requests: [{ addSheet: { properties: { title } } }] },
          }),
          `creating the tab ${title}`,
        );
        sheetId = (await sheetIds()).get(title);
      }

      await ok(
        await call(':batchUpdate', {
          method: 'POST',
          body: {
            requests: [
              {
                updateCells: {
                  range: { sheetId, startRowIndex: 0, startColumnIndex: 0 },
                  rows: rows.map((row) => ({ values: row.map(cellData) })),
                  fields: 'userEnteredValue',
                },
              },
            ],
          },
        }),
        `writing ${title}`,
      );
    },
  };
}
