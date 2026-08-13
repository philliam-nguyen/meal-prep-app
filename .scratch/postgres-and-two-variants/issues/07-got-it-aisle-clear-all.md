# 07 - Got It, Aisle, and one action that clears every mark

Status: ready-for-agent

**What to build:** A cook marks a Shopping List entry as Got It while walking the aisles and the mark
survives closing the app to answer a text message. They see the Aisle an Ingredient lives in, so the
list follows the store's layout, and they correct an Aisle so it is right the next time too. One
action clears every Got It mark when a new list starts.

Got It and Aisle are properties of the Ingredient rather than of a Shopping List row. That is what
makes the Shopping List derivable without losing this state, and it keeps the entry one row in the
UI.

Today Got It never resets. The client carries the previous mark forward for any Ingredient whose name
matches, and the spreadsheet keeps it indefinitely, so overlapping Ingredients arrive pre-ticked on
later trips and get walked past. One deliberate action clears them. Nothing clears them
automatically: adding a forgotten Recipe mid-trip must not wipe ticks earned in the store, which
would be worse than the bug.

**Blocked by:** 06 (Selected Recipes and the derived Shopping List).

- [ ] Marking an entry Got It persists across a reload
- [ ] Setting an Aisle on an Ingredient shows wherever that Ingredient appears
- [ ] Changing which Recipes are Selected leaves existing Got It marks alone
- [ ] One action clears every Got It mark and disturbs nothing else, proven by a test
- [ ] Both toggles use the optimistic-then-revert pattern from ticket 06
- [ ] No automatic clearing on any other event
