# 17 - Cutover into the real database

Status: ready-for-human

**What to build:** The Operator's extract runs into the real Homelab Variant database. Row counts and
a sample of Recipes get inspected. Only then does the frontend repoint. A bad extract costs a truncate
and a rerun rather than a weekend.

Hard cut, no separate rehearsal database. That is safe because the extract reads the spreadsheet and
writes an empty target, which gives effectively unlimited rehearsals in place.

Two conditions are not optional:

- The spreadsheet stays intact through cutover, so truncate-and-rerun is always available
- Nothing repoints until the inspection passes

Expect the Ingredient deduplication to surface genuine mess in the existing names. That is the cost of
Ingredient gaining an identity, and it lands here.

**This carries `ready-for-human` rather than `ready-for-agent`** for two reasons. The
extract-and-load script is out of scope for this work and the Operator writes it; this ticket is the
target, the verification and the sequence. And the run touches real personal data on a live instance,
which is a person's call to make and to check.

**Blocked by:** 13 (the Homelab Variant running), 14 (backups, because cutting over to a database with
no dumps is a regression against the spreadsheet's version history).

- [ ] Row counts per table compared against the spreadsheet and recorded
- [ ] A sample of Recipes inspected end to end: name, Recipe Type, Recipe Card, and every Recipe Ingredient with quantity and unit
- [ ] Quantities that did not parse to a number listed for review rather than silently zeroed
- [ ] Ingredient names that merged into one row listed and confirmed as the same food
- [ ] The spreadsheet untouched and still readable after the run
- [ ] The rollback exercised at least once before the run that counts
- [ ] The frontend repointed only after the above, ending GitHub Pages hosting for the personal instance
- [ ] The new connection string never committed
