# 18 - Approval-gated export back to the spreadsheet

Status: ready-for-human

**What to build:** The Operator reviews a diff and approves before anything writes to the spreadsheet,
so it stays a readable copy they trust rather than a mirror of whatever just happened.

This is not the backup and must not be documented as one. Its recovery point equals the last approval,
and the target is lossy now that the schema carries identities and foreign keys. Ticket 14 is the
backup. Nothing in the app or in either deployment depends on this export running.

It survives cutover as a phone-readable convenience and a cold copy.

**Blocked by:** 09 (the full data model settled). In practice this follows ticket 17, since the export
only means anything once Postgres holds the real data.

- [x] Running the export shows what would change in the spreadsheet and writes nothing until approved
- [x] Declining the approval leaves the spreadsheet untouched
- [ ] The exported tabs are readable on a phone without the app
- [x] The export is documented as a convenience copy rather than a backup
- [x] Nothing in the app or in deployment depends on the export running

## Comments

**Built.** An operator command, `packages/api/src/export.js`, run as the API's own image with a
different command the way the migration step and the Seed restore are. It reads the first-paint
payload through `readState`, renders it into three tabs, shows what would change in the spreadsheet
and writes only what a person answered yes to. No npm script, deliberately - the same treatment the
Seed restore gets, since neither is a routine command.

**Where each piece lives.**

- `packages/api/src/spreadsheetExport.js` - the whole of the interesting logic, and pure. Snapshots
  the payload into tab-shaped rows (`exportTabs`), diffs those against what a tab currently holds
  (`diffTab`), renders the diff for a person to read (`describeDiff` / `describeExport`), and runs
  the gate (`runExport`).
- `packages/api/src/sheetsClient.js` - the live Google glue behind the seam, and nothing else.
- `packages/api/src/export.js` - the command: config, pool, credentials, the stdin prompt.
- `packages/api/src/config.js` - `readExportConfig`, alongside the migrate and Seed readers.
- `packages/api/test/spreadsheet-export.test.js` - 19 tests, none of which reach Postgres or Google.
- `docs/adr/0011-spreadsheet-export-is-a-convenience-copy.md`, plus sections in `README.md`,
  `docs/runbooks/homelab.md` and `.env.example`.

**The seam** is two methods: `readTab(title)` and `writeTab(title, rows)`. The suite passes a fake
that records its writes; the live one signs a service account assertion with `node:crypto` and calls
three REST endpoints with `fetch`. `readTab` answers `[]` for a tab that does not exist yet, so a
first run is a diff full of added rows rather than a failure, and `writeTab` is what creates the tab -
nothing comes into existence in the spreadsheet before an approval, tabs included.

**Tabs.** `Recipes` (Recipe, Recipe Type, its Recipe Ingredients in one cell, Recipe Card, Selected),
`Shopping List` (Ingredient, amount per unit, Aisle, Got It), `Pantry` (Ingredient, in the Pantry,
Staple). One row per thing, narrow enough for a phone, and lossy on purpose - no ids, no Recipe
Ingredient rows, no Protected mark. `Ingredients Match` is not carried forward, per `CONTEXT.md`.

**The gate** is an interactive prompt that takes the whole word `yes`, with `--dry-run` as the
preview that never asks. A stdin that is not a terminal declines rather than blocking or reading what
was piped in, so every unattended context fails to "nothing was written". The diff is keyed on each
row's leftmost cell rather than on the row number, because the tabs are ordered by name and one new
Recipe near the top would otherwise report the whole tab as rewritten - a diff nobody can read is a
rubber stamp. Rows with a repeated name are disambiguated by occurrence, since Recipe names are not
unique the way Ingredient names are.

**Decisions of ADR weight**, all recorded in ADR-0011:

- The export writes a **fresh spreadsheet**, never the Sheets-era one. That sheet's id is committed
  in public history and it is link-shared (ADR-0004), so exporting into it would republish the
  collection cutover just took private - and ticket 17 needs it left intact as the extract's source.
- A **service account** with the `spreadsheets` scope, its key file named by
  `SHEETS_CREDENTIALS_FILE` and living outside the checkout. Its access is one share on one
  spreadsheet, made in Sheets rather than granted in Google Cloud.
- **No Google client library.** `packages/api` is what both Variants deploy, so a dependency there is
  a dependency in production, and the export needs three endpoints and a six-line signed assertion.
  The image gains nothing it does not run.
- The **one-way lossy contract**: recovery point equals the last approval, nothing loads back out,
  ticket 14's dumps are the backup.

**Not verified: the phone-readability criterion.** The tabs are designed for it and the suite asserts
the shape - one row per thing, every cell a string, three narrow tabs - but nobody has opened the
real spreadsheet on a phone, because no live spreadsheet was written. That is an Operator check on
the first real run, and `--dry-run` is what makes that run safe to attempt.

**Nothing depends on it**, and that is asserted rather than left to review: a test walks
`packages/api/src` and fails if anything but `export.js` imports either export module, and checks
that `compose.yaml` has no export service. Terraform has none either, though ticket 15 has not landed
yet, so that half is a statement rather than an assertion.

**Untested by design:** `sheetsClient.js`. It is glue over HTTP to a service the suite may not reach,
and ADR-0011 says so in as many words. The Operator finds out whether Google answers as documented on
the first run.

**Verification:** `npm test` at the root, all green - 288 API, 23 shared, 17 web, 17 root, 0 failures.

**Reviewed** on the branch, two axes (standards and spec). The spec axis traced the write path and
confirmed the gate: every read and the whole diff display happen before `approve` is asked, a decline
or a non-terminal stdin returns before any `writeTab`, and `writeTab` is the only thing that creates
tabs. Fixed from the review: the Recipes tab header now says `Recipe Type` rather than `Type`; the
diff summary no longer counts the header row as an unchanged row; `--dry-run` no longer prints two
lines for one outcome (the preview declines silently and `runExport` announces "not approved: the
spreadsheet was not touched"); two comments used vocabulary `CONTEXT.md` avoids ("food",
"production") and now use the glossary's terms. Left as noted, not fixed: the token cache in
`sheetsClient.js` outlives a single run's needs, `runExport` re-finds a tab by title that `diffTab`
could have carried, and a row literally named `soup (2)` beside two rows named `soup` would collide
in the diff keying - all judged too small to churn reviewed code over.

**Status is `ready-for-human`** rather than `done`: `done` requires every checklist item ticked
(docs/agents/triage-labels.md), and the phone-readability check needs a person with a phone and a
real spreadsheet. Everything an agent can verify is built, tested and reviewed; the first live
`--dry-run` and the phone check are the Operator's.
