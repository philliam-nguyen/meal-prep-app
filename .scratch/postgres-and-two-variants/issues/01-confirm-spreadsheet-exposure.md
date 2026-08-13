# 01 - Confirm and close the committed spreadsheet exposure

Status: wontfix

**What to build:** An answer to whether this repository is public, and a recorded decision on the
spreadsheet's link-sharing.

`SHEET_ID` sits in the committed frontend, and the README instructs the reader to share the
spreadsheet with anyone holding the link. If the repository is public, anyone who finds it can read
the personal data through the spreadsheet's own CSV export endpoint, with no API key involved.

Tightening the sharing breaks the running app, because the Sheets API key path requires
link-sharing. Repository visibility is the lever that matters. The migration removes the exposure as
a side effect at ticket 17, provided the new connection string is never committed.

**Blocked by:** None - can start immediately.

- [x] Repository visibility confirmed as public or private, and the answer recorded in this file
- [x] If public: a decision recorded, either make it private or accept the exposure until ticket 17 removes it
- [x] Any identifier or credential that must not survive the migration listed here, so ticket 17 removes it
- [x] Status updated away from `needs-info` once the question is answered

## Answer

The repository is public. An unauthenticated GitHub API request returned 200:

    curl --ssl-no-revoke -o /dev/null -w "%{http_code}" https://api.github.com/repos/philliam-nguyen/meal-prep-app
    200

The request carried no credentials, so a 200 means any anonymous reader can fetch the repo and read
`SHEET_ID` out of `index.html`. The `--ssl-no-revoke` flag works around a schannel revocation-check
failure on this machine and has no bearing on the result.

The spreadsheet looks readable without sign-in, though nobody has finished the check. An anonymous
request to the sheet's `/export?format=csv` endpoint answered 307 with a signed
`googleusercontent.com` download URL, which is the response Google gives for a document it intends
to serve. A restricted sheet redirects to a sign-in page instead. Nobody completed the download,
since that pulls personal data into an agent session, and a HEAD against the signed URL returns 400
because those URLs reject HEAD. Opening the export URL once in a signed-out browser settles it.

## Decision

Accept the exposure until the Postgres migration removes the Sheets path. The exposed tabs hold
Recipes, Ingredients, Shopping_List, and Ingredients Match: household cooking data, no credentials,
nothing about anyone beyond the two people using the app. ADR-0004 records the reasoning and the
alternatives that lost.

Two consequences worth restating here. Ticket 17 sits behind 13 and 14, so the accepted window runs
to weeks rather than days. And `SHEET_ID` is already in committed history on a repository that has
been public throughout, so it stays known whatever happens to repo visibility later. The sheet is
the thing to retire, not the identifier.

## Identifiers and credentials that must not survive the migration

- `SHEET_ID`, hardcoded at `index.html:106` and committed. Leaked as described above.
- The Google Sheets API key. Never committed. `index.html:110` reads it from `localStorage`, and
  README:33 has each new person entering the same key by hand. Check that it carries an API
  restriction and a referrer restriction in Cloud Console. A shared unrestricted key is a billing
  exposure independent of this ticket.
- The Apps Script web-app URL. Never committed. `index.html:112` reads it from `localStorage`, and
  `index.html:628` tells the user to deploy it with access set to Anyone. It accepts unauthenticated
  POSTs that append rows, rewrite tabs, and update single cells, so it is a write path guarded by
  nothing but the secrecy of its URL. Shut the deployment down at cutover rather than leaving it
  live beside the new API.

## Comments

Status set to `wontfix` rather than `ready-for-human`, because the decision is to take no action
here and let cutover remove the exposure. Nothing remains for a human or an agent to build in this
ticket. Reopen it as `ready-for-human` if the migration stalls and the fresh-spreadsheet option
comes back on the table.

The third checklist item pointed at `ticket 09`; corrected to `17`. Ticket 09 is
`edit-delete-recipe-protected` and has nothing to do with retiring identifiers, and the body of this
ticket already names 17 as the point where the exposure goes away.
