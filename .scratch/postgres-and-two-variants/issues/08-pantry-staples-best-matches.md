# 08 - Pantry, Staples, and Best Matches

Status: done

**What to build:** A cook ticks which Ingredients are in the Pantry and watches Best Matches reorder,
with the shortest trip to the store at the top. Each match names exactly which Missing Ingredients it
needs, so the cook can judge whether it is worth going out, and a Recipe with nothing Missing reads
as cookable right now.

The rule is defined fresh in SQL. The spreadsheet formulas in columns D, E and F of the
`Ingredients Match` tab were never in the repository and are not needed:

- Rank by the absolute count of Missing Ingredients, ascending
- Quantity-blind. The Pantry is membership only, so an Ingredient is present or absent, never "enough"
- Staples never count as Missing and never appear in the Pantry checklist
- Recipes with zero Pantry overlap are excluded
- The returned list is capped

Absolute count rather than percentage complete, because the question is how short the trip to the
store is, and one missing item is one stop whether the Recipe needs four Ingredients or fourteen.

Missing Ingredients comes back as a list of names. The `"Nothing Missing"` sentinel string goes away
and an empty list takes its place.

Marking an Ingredient as a Staple belongs here too, so the list gets curated as things get noticed.

**Blocked by:** 05 (add a Recipe), which is where the local database gets Recipes with Ingredients.

- [x] Ticking a Pantry Ingredient reorders Best Matches without a manual refresh
- [x] Ranking is by ascending count of Missing Ingredients
- [x] A Recipe whose only gaps are Staples reports an empty Missing list
- [x] Staples are absent from the Pantry checklist
- [x] A Recipe with no Pantry overlap does not appear in Best Matches
- [x] The returned list respects its cap
- [x] No magic string stands in for an empty Missing list
- [x] Marking an Ingredient a Staple removes it from the checklist and from Missing calculations
- [x] Two Recipes referencing one Ingredient share its Pantry membership, proven by a test

## Comments

**This ticket shares its commit with 06.** The work was done in a working tree shared with the agents
building 06, 07 and 11, so `state.js`, `App.jsx` and `api.js` each hold two tickets' changes. Ticket
11 committed on its own. Ticket 06 had not committed by the time this landed, and its changes cannot
be separated from these without leaving a commit that does not build, so the operator ruled on
2026-08-14 that one commit carries both.

**The payload carries two lists, not one collection with a flag.** `/api/state` returns
`pantryChecklist` (the non-Staple Ingredients, each with `inPantry`) and `staples` separately. The
alternative was one `ingredients` array with a `staple` boolean for the client to filter, which is
what the rest of the payload does: the whole Recipe collection travels and the client narrows it.

It went the other way here because "Staples are absent from the Pantry checklist" is an acceptance
criterion, and as a client-side filter it would sit in the one part of this codebase ADR-0005
leaves untested. As two queries it is a property of `ingredients.js` that a test holds to. The
`staples` list is not redundant: without it a cook who mis-taps has no way to see or undo a Staple,
which is the "cannot fix the app from inside itself" complaint the spec makes about the spreadsheet.

**A Recipe made entirely of Staples does appear in Best Matches, by a ruling from the operator on
2026-08-13.** It was built the way this ticket words it first: exclude a Recipe when the Pantry holds
none of its Ingredients. A Staple is never in the Pantry, so a Recipe of nothing but Staples was
dropped even though the cook could start it that minute. The operator ruled the other way, on the
grounds that CONTEXT.md defines a Staple as an Ingredient assumed to always be on hand, so the cook
does have it.

A Recipe now qualifies on either of two counts: it has Pantry overlap, or it has no Missing
Ingredients at all. The second one is what lets the all-Staple Recipe through.

The obvious cheaper change was to let a Staple count as Pantry overlap, and it is wrong. Every Recipe
that so much as mentions salt would then appear against an empty Pantry, which is the padding the
exclusion exists to prevent. Having the salt is not having the soup. A test named for that pins it.

**Both writes send a value rather than asking for a flip.** `PUT /api/ingredients/:id/pantry` takes
`{inPantry}` and `PUT /api/ingredients/:id/staple` takes `{staple}`, both answering 204. Two phones
share one Pantry, so a toggle sent from a screen that has gone stale lands on the opposite of what
the cook saw, and a retry after a dropped response undoes the write it is retrying. A desired state
lands on itself however many times it arrives, which is also what makes the spec's last-write-wins
correct here rather than a compromise. This matches the shape 06 gave
`PUT /api/recipes/:id/selected`.

**Becoming a Staple gives up Pantry membership.** Otherwise a tick survives underneath the Staple
mark where nobody can see or clear it, and unmarking hands back a tick the cook never chose. For the
same reason, ticking an Ingredient that is a Staple is refused with a 400 naming it, rather than
writing a field the checklist will never show.

**The cap is 20.** The spec says only "cap the returned list". Twenty is what a cook scans on a
phone before deciding, and it doubles as the ceiling on how much work one anonymous read can ask of
the Demo Variant. The test asserts the number rather than importing the constant, so changing it is
a deliberate act.

**The pre-migration interactions are carried forward**, per the rule settled on ticket 05. The old
`Ingredients Match` page had a scrollable checklist of `checkbox-btn` rows, an optimistic tick that
reverted on a failed write, a heading that read `BEST MATCHES` or `SELECT INGREDIENTS ABOVE`
depending on whether anything was ticked, an `(updating...)` suffix while matches refreshed, a
"No matches found yet." line, and `match-card`s showing either "You have everything!" or
`Missing: ...`. All of those survive. New: marking a Staple from a checklist row, and a "Put back"
list for undoing it. Gone: the `"Nothing Missing"` sentinel, which is an empty array now.

**Marking a Staple waits for its write, unlike the Pantry tick.** It moves an Ingredient between two
lists rather than flipping one field, and a cook does it when they notice one rather than twelve
times down an aisle, so it lets the reload place the row. The Pantry tick is optimistic and reverts
on failure, and it stays quiet on success, because a dozen confirmations walking down a checklist
would be noise.

**Best Matches never reranks on the client.** A tick lands on screen at once, then the new ranking
arrives from `/api/state`. Reordering locally would mean a second copy of the match rule in the
browser, which is the duplication this ticket removes.

**Verified.** 131 tests green in the API package, 26 of them this ticket's, plus 23 in shared. The
frontend bundle builds. Every statement on both new paths is parameterized.

**One line of this ticket had to be written twice.** The agent building 06 rewrote `state.js`,
`packages/web/src/api.js` and `App.jsx` while this work sat uncommitted in the same working tree,
which dropped every ticket 08 change in those three files. Nothing was lost beyond the time to
notice and reapply, because the new files survived and the tests caught the gap at once. A worktree
per agent prevents it.

**What a human still needs to click.** Nobody has opened the Pantry tab in a browser. The API half
of "reorders without a manual refresh" is tested (`reorders as soon as an Ingredient is ticked`);
the client half is the reload after a successful write, which is read but not exercised, because the
frontend has no tests and no browser driver is installed here.

**One thing left alone.** The `.match-bar` and `.match-bar-fill` CSS rules are unused: they drew a
percentage-complete bar, and ranking is by absolute count now, so nothing here wants one.
`ComingWithWrites.jsx` lost its last import when this ticket replaced the Pantry placeholder, and
06 has already deleted it.
