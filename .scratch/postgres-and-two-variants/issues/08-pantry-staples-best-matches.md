# 08 - Pantry, Staples, and Best Matches

Status: ready-for-agent

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

- [ ] Ticking a Pantry Ingredient reorders Best Matches without a manual refresh
- [ ] Ranking is by ascending count of Missing Ingredients
- [ ] A Recipe whose only gaps are Staples reports an empty Missing list
- [ ] Staples are absent from the Pantry checklist
- [ ] A Recipe with no Pantry overlap does not appear in Best Matches
- [ ] The returned list respects its cap
- [ ] No magic string stands in for an empty Missing list
- [ ] Marking an Ingredient a Staple removes it from the checklist and from Missing calculations
- [ ] Two Recipes referencing one Ingredient share its Pantry membership, proven by a test
