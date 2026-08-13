# 06 - Selected Recipes and the derived Shopping List

Status: ready-for-agent

**What to build:** Marking a Recipe as a Selected Recipe pulls its Ingredients onto the Shopping
List, and deselecting removes them. The list holds one entry per Ingredient however many Selected
Recipes call for it, so nobody walks past the onions twice. Quantities are summed within each unit
and shown as a set of amount-and-unit pairs.

That corrects arithmetic which is wrong today. The current client groups by Ingredient name and keeps
the first unit it meets, so two cups plus three hundred grams renders as a single number with one of
the two units attached.

The derivation moves into SQL and computes on read. Delete the client-side `computeShoppingList`.
It exists twice right now, once in a spreadsheet formula and once in the client, which means the two
can disagree. After this ticket, one implementation.

A cook ticking twelve items down an aisle should not wait twelve times, so a toggle registers on
screen before the round trip finishes. A failed write reverts visibly rather than leaving a tick that
never saved. Later toggles reuse this pattern.

**Blocked by:** 05 (add a Recipe), which is where the local database gets Recipes to select.

- [ ] Selecting a Recipe adds its Ingredients to the Shopping List, and deselecting removes its contribution
- [ ] One Ingredient called for by three Selected Recipes renders as one entry
- [ ] Two Recipes calling for the same Ingredient in different units produce separate amounts on one entry, each with its own unit
- [ ] An unquantified Recipe Ingredient does not become a zero in the sum
- [ ] No client-side Shopping List computation remains in the frontend
- [ ] A toggle appears immediately and reverts on a failed write, with the failure visible to the cook
- [ ] Tests cover consolidation across Selected Recipes, summing within units, and deselection
