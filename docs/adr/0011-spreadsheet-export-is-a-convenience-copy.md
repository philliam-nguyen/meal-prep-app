---
status: accepted
date: 2026-08-20
---

# The export back to the spreadsheet is an approval-gated convenience copy, not a backup

After cutover the spreadsheet keeps one job: being readable on a phone by somebody who has no app in
front of them. An Operator command reads the database, shows what would change in three tabs, and
writes only what a person answered yes to. It runs on no schedule, and nothing in the app or in
either Variant's deployment depends on it having run.

This is written down because "an export back to the spreadsheet" is the kind of thing that gets
mistaken for a safety net, and the mistake is only discovered on the day somebody needs one.

## It is not the backup, and the gate is why

The recovery point of this export is the last time a person read a diff and approved it. That is a
recovery point measured in weeks and set by whether anyone felt like running a command, which is not
a property a backup is allowed to have. The spec puts the real answer elsewhere and says why: ticket
14's nightly `pg_dump`, dated, a month retained, a copy off the homelab, alerting when a dump goes
missing or comes back zero bytes, no human in the loop. That runs unattended, which is the whole
difference.

The target is also lossy, and deliberately. The tabs carry no ids, no Recipe Ingredient rows, no
Staple-versus-Pantry foreign keys and no Protected mark, because a person reading a Shopping List on
a phone does not want a join key in column A. Nothing loads back out of these tabs. Restoring from
this spreadsheet is not a slow path or an awkward path; it is not a path.

Retention rather than review is what protects against corruption, and this export has review rather
than retention. A bad write approved in a hurry overwrites the previous copy, and Sheets' own version
history is then the only thing standing behind it - which is a real thing, and still not a backup
this project is entitled to count on, because nothing here creates it or checks it.

## The approval is the feature

The obvious design is a scheduled one-way sync, and it is the wrong one. A mirror of whatever just
happened is worth nothing to the person holding the phone: if the database is what they distrust,
the copy that agreed with it five minutes ago cannot tell them anything. The gate is what makes the
spreadsheet a copy somebody stands behind rather than a second display of the same state.

So the export shows the diff and stops. It writes after an explicit `yes`, typed in full, and
declines on anything else. A stdin that is not a terminal declines too rather than blocking or
reading whatever was piped in, which makes the failure mode of every unattended context "nothing
happened". `--dry-run` is the preview that never asks.

The diff is keyed on each row's leftmost cell rather than on the row number, because the tabs are
ordered by name and one new Recipe near the top would otherwise report the whole tab as rewritten. A
diff nobody can read is a rubber stamp, and a rubber stamp is the same thing as no gate at all.

## It exports into a fresh spreadsheet

Not the Sheets-era one. [0004](./0004-accept-spreadsheet-exposure-until-cutover.md) accepted that the
old spreadsheet's id is committed in a public repository and that the sheet is shared with anyone
holding the link, on the grounds that cutover retires the exposure (since closed - see 0004's
amendment; un-sharing the old sheet is the remaining Operator action). Writing the collection back into
that same sheet would reopen it - the same personal data, the same anonymous readers, now on the far
side of a migration whose security deadline this was.

There is a second reason. The old spreadsheet is the extract's source, and ticket 17 requires it stay
intact so that a bad cutover is a truncate and a rerun. An export that rewrote its tabs would take
that away.

So `SHEETS_SPREADSHEET_ID` names a new spreadsheet, shared with the Operator and the service account
and nobody else, and the old one is left alone to be retired.

## Authentication is a service account, and no client library

Writing to Sheets needs a credential, and there is none to inherit: the Sheets-era app read with a
browser API key and wrote through an Apps Script web app that was never committed. A service account
is the right shape for a command with no human session - the private key file is the whole
credential, there is no consent screen and no refresh token to store - and its access is one share on
one spreadsheet, made in Sheets rather than granted in Google Cloud. The scope requested is
`spreadsheets` and not `drive.file`, so the credential can reach files it was given and cannot create
any.

The key file is named by `SHEETS_CREDENTIALS_FILE` and lives outside the checkout. It is not in
`.env` itself, because a PEM private key does not survive a single line in that file.

Google's client library was rejected on what it would cost the image rather than on merit. The API
image is what both Variants deploy, `packages/api` is where the commands live, and a dependency there
is a dependency in production. The export needs three endpoints - a token, a values read, a
`batchUpdate` - and a signed assertion `node:crypto` produces in six lines, so `src/sheetsClient.js`
calls them with `fetch` and the image gains nothing it does not run.

## Consequences

The tabs are `Recipes`, `Shopping List` and `Pantry`, one row per thing, each narrow enough to read
on a phone. A Recipe's Recipe Ingredients sit in one cell of its row rather than in rows of their
own, which is the same choice `state.js` makes for the same reason: a Recipe Ingredient is
meaningless on its own. The `Ingredients Match` tab is not carried forward - `CONTEXT.md` records
that name as two unrelated things wearing one, and Best Matches is a ranking the app computes rather
than a copy anybody reads on a phone.

The rows are rendered from the first-paint payload rather than from queries of the export's own, so
the Shopping List in the spreadsheet is the Shopping List the app shows. [0009](./0009-degraded-mode-from-a-recorded-seed.md)
records the same reasoning for the recorded Seed: a second implementation of a derivation is the
defect `state.js` exists having removed.

Every cell is written as text, never as a formula, so an Aisle somebody typed cannot become one.

`src/sheetsClient.js` is not covered by the suite. It is glue over HTTP to a service the tests may
not reach, and the seam it sits behind - two methods, `readTab` and `writeTab` - is where the tests
stand instead, with a fake in its place. The snapshot, the diff and the gate are all tested there;
what is untested is whether Google answers as documented, and the Operator finds that out on the
first run against a real spreadsheet. `--dry-run` is what makes that first run safe.

A tab the spreadsheet does not have yet reads as empty rather than as a failure, and is created by
the write that follows the approval rather than by the read that precedes it. Nothing comes into
existence in the spreadsheet before somebody approves it, including the tabs.

The whole personal collection ends up in a Google-hosted document, which is where it already lived
and is a trust boundary worth naming rather than assuming. The one thing that must stay true of the
target is that it is not link-shared.
