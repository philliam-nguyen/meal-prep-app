# 18 - Approval-gated export back to the spreadsheet

Status: ready-for-agent

**What to build:** The Operator reviews a diff and approves before anything writes to the spreadsheet,
so it stays a readable copy they trust rather than a mirror of whatever just happened.

This is not the backup and must not be documented as one. Its recovery point equals the last approval,
and the target is lossy now that the schema carries identities and foreign keys. Ticket 14 is the
backup. Nothing in the app or in either deployment depends on this export running.

It survives cutover as a phone-readable convenience and a cold copy.

**Blocked by:** 09 (the full data model settled). In practice this follows ticket 17, since the export
only means anything once Postgres holds the real data.

- [ ] Running the export shows what would change in the spreadsheet and writes nothing until approved
- [ ] Declining the approval leaves the spreadsheet untouched
- [ ] The exported tabs are readable on a phone without the app
- [ ] The export is documented as a convenience copy rather than a backup
- [ ] Nothing in the app or in deployment depends on the export running
