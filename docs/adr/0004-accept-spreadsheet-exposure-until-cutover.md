---
status: accepted
date: 2026-08-04
---

# The public spreadsheet exposure stands until the Postgres migration retires it

The Sheets-era app hardcodes its spreadsheet ID in the committed frontend, and it only works when
the spreadsheet is shared with anyone holding the link. The repository is public. Those three facts
together let any anonymous reader lift the ID out of the committed HTML and pull the whole
spreadsheet as CSV, with no API key involved. The exposure stays open until cutover retires the
Sheets path, and the app keeps serving two phones in the meantime.

What sits behind the link is household cooking data: recipes, their ingredients, a shopping list,
and a pantry checklist. No credentials, no financial data, nothing identifying anyone beyond the
fact that two people cook together. The migration deletes the Sheets read path, so closing the
exposure now buys a few weeks of cover on code already scheduled for demolition.

[0003](./0003-no-application-auth.md) covers the access model after the migration. This one covers
the window before it, and it is the single place in the migration where a real exposure trades
against delivery speed, which is why it gets an ADR instead of a line in a ticket.

## Considered options

**Make the repository private.** Rejected as mitigation dressed as remediation. The spreadsheet ID
is already in committed history on a repository that has been public for its whole life, so anyone
who has looked keeps it. Publishing from GitHub Pages also requires a public repository on a free
plan, so going private takes the app off the phones for the whole migration, which is the one thing
the migration may not do.

**Rotate to a fresh spreadsheet and keep the new ID out of the repository.** Rejected on cost, not
on merit. It closes the exposure while the app keeps working, and it becomes the right answer the
moment the sheet holds anything beyond groceries. It needs manual work in Google Sheets plus a
change to how the frontend gets its ID, inside the file the migration is about to replace.

**Un-share the spreadsheet now.** Rejected as self-defeating. The API key read path depends on
link-sharing, so tightening it stops the running app dead with no replacement ready.

## Consequences

Personal cooking data is readable by any anonymous visitor for the rest of the migration, a window
of weeks rather than days. Nobody will know whether anyone reads it, because a link-shared
spreadsheet keeps no access log its owner can see.

Treat the spreadsheet ID as public knowledge from here on. Any later decision to keep using this
spreadsheet has to start from that, and the honest way to undo the exposure is to retire the
spreadsheet rather than to hide its ID.

The Apps Script deployment behind the app's write path is a sharper risk than the read exposure this
ADR accepts. It takes unauthenticated POSTs that append rows and rewrite whole tabs, guarded only by
the secrecy of its URL, which the repository does not publish. Out of scope here, and it needs
shutting down at cutover rather than leaving it live beside the new API.

Cutover is now a security deadline and not only a feature milestone. If the migration stalls, this
decision expires with it and the fresh-spreadsheet option is the one to revisit.

## Amendment, 2026-08-21: cutover happened, and the window this ADR held open is closed

Ticket 17 completed cutover on 2026-08-21. The Sheets read path is deleted, GitHub Pages hosting
for the personal instance is ended (verified: the Pages API returns no site for the repository),
and the Apps Script deployment behind the old write path — the sharper risk named above — is shut
down. The exposure this ADR accepted no longer has a serving app behind it.

**What it did not close.** The old spreadsheet still exists, still link-shared, and its ID sits
permanently in public git history. "Treat the spreadsheet ID as public knowledge" stands forever.
The data it holds is the pre-cutover snapshot, which is the same household cooking data now live
in Postgres.

**The honest remediation named above is now available.** The phone-readable-copy job moved to a
fresh, unshared spreadsheet ([0011](./0011-spreadsheet-export-is-a-convenience-copy.md)), and
cutover's only requirement on the old sheet — staying intact so truncate-and-rerun stayed
possible — is spent. Un-sharing or deleting the old spreadsheet is now pure gain, and doing it is
the one remaining Operator action under this ADR.
