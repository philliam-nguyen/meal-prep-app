# 07 - Got It, Aisle, and one action that clears every mark

Status: done

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

- [x] Marking an entry Got It persists across a reload
- [x] Setting an Aisle on an Ingredient shows wherever that Ingredient appears
- [x] Changing which Recipes are Selected leaves existing Got It marks alone
- [x] One action clears every Got It mark and disturbs nothing else, proven by a test
- [x] Both toggles use the optimistic-then-revert pattern from ticket 06
- [x] No automatic clearing on any other event

## Comments

**Three endpoints.** `PUT /api/ingredients/:id/got-it` takes `{gotIt: boolean}` and
`PUT /api/ingredients/:id/aisle` takes `{aisle: string|null}`, both answering 204 and both setting a
value rather than flipping one, for the reason ticket 06 gave: two phones share the list, and a
retry after a dropped response must not undo the write it is retrying. Neither returns a body. The
Shopping List they change is derived, so the client reads it from the next `/api/state`.

Clearing is `DELETE /api/shopping-list/got-it`. The path names the cook's action rather than the
column it writes, because `CONTEXT.md` defines Got It against a Shopping List entry, and DELETE
says what a second request does: clearing marks that are already clear leaves the same state.
`DELETE /api/ingredients/got-it` was the other candidate and lost on a collision that has not
happened yet. Ticket 09 adds `DELETE /api/recipes/:id`; if anything later adds the same for
Ingredients, a static `/api/ingredients/got-it` would shadow the Ingredient whose id is `got-it`.
Ids are minted as `I001`, so nothing breaks today, and a route that cannot collide costs nothing.

The handler lives in `ingredients.js` even though the path does not say so, because the mark is a
property of the Ingredient. That is what lets it survive the list being derived again. Grep finds
it; a module holding one statement would not have earned itself.

**Clearing reaches every Ingredient, not every entry.** `update ingredients set got_it = false where
got_it`. The stale tick the spec describes is exactly the Ingredient that has dropped off the list
and comes back pre-ticked next trip, so scoping the clear to what the Shopping List currently
derives would miss the case it exists for. A test pins that down by clearing while the Recipe is
deselected and re-selecting afterwards. The `where got_it` guard keeps a two-tick clear from
rewriting every row to say what it already said.

**Nothing else clears a mark, and five tests say so.** Selecting another Recipe mid-trip,
deselecting one that shares the Ingredient, a Recipe deselected and selected again, ticking the same
Ingredient into the Pantry, setting its Aisle. The spec rejected auto-clearing because a cook adding
a forgotten Recipe would lose ticks earned in the store.

**Aisle is free text with a cap and no allowlist.** `AISLE_MAX` is 40 and sits in
`packages/shared/src/schema.js`, where the migration says caps belong, because the cook types it into
a box on the Shopping List and the input and the route have to agree on one number. Store sections
read "Aisle 12 - Dairy & eggs", and an allowlist tight enough to be worth enforcing would refuse the
real ones. The stored-XSS rule that governs the Recipe Card URL does not reach here: an Aisle renders
as text, which React escapes, and never as an `href`. Empty and whitespace normalize to null, so an
emptied box clears the Aisle instead of leaving a heading with no name in it.

**Ordering by Aisle was left out, on the operator's call.** Ticket 06 handed it here ("Ticket 07 is
where that ordering belongs") and the ticket body argues for it, but no checklist item covers it and
the operator chose to keep the name ordering when asked. Entries still come back ordered by
Ingredient name. Story 14 is satisfied by showing the Aisle rather than by sorting on it. Whoever
wants the sort has one `order by` to change in `SHOPPING_LIST_QUERY` and the ordering test to
rewrite.

**ADR-0005's bounded exception narrowed again.** `markIngredient` is gone from
`test/helpers/flags.js`, and `shopping-list.test.js` arranges Got It and Aisle through the new
endpoints. What survives is `markRecipe` setting `protected`, which waits on the Seed in ticket 12.
The ADR's own Consequences paragraph still describes the exception as it stood before ticket 06 and
now trails two tickets behind; ADRs are append-only here, so this ticket left it and flags it.

**The frontend.** Got It, Aisle and the clear all use optimistic-then-revert. A failed write puts
the previous value back and names the Ingredient in a toast, so nothing on screen looks saved when
it is not. The Got It toggle raises no toast on success and reloads in the background afterwards,
matching the Pantry toggle: a cook ticks a dozen entries down one aisle, a dozen confirmations would
be noise, and the reload is what writes the mark into the offline cache and brings the other phone's
ticks over.

The Aisle line under an Ingredient's name is a label until tapped and a box after. One piece of
state holds the draft and the mode together, so Escape closes the box before the blur handler can
commit what it is abandoning.

Clear all sits at the foot of the list behind an inline confirm, because it can undo a whole shop
and the app has no `confirm()` anywhere else to borrow.

**One pre-existing route changed.** Three writes now share `setIngredientField`, which was three
identical copies of the same row-count-to-404 tail. The Staple route went through it too rather than
leaving two idioms in one file. The Pantry write stays separate: it can miss for a second reason,
and telling a missing Ingredient from a Staple is worth the extra query.

**Verified.** 157 API tests and 23 shared, from a 131-and-23 baseline, plus a clean frontend build.
Nobody has clicked any of this in a browser. The suite drives Fastify through `inject`, the spec
excludes the frontend from testing, and no browser driver is installed here.

**Built in a worktree off `postgres-migration`,** not off `main`, because ticket 06 has not merged
and this depends on it. Tickets 07 and 10 were built in parallel worktrees and both touch `app.js`,
`api.js` and `App.jsx`, so whoever lands the second one resolves the overlap.
