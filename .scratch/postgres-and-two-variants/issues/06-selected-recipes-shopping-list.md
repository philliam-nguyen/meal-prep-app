# 06 - Selected Recipes and the derived Shopping List

Status: done

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

- [x] Selecting a Recipe adds its Ingredients to the Shopping List, and deselecting removes its contribution
- [x] One Ingredient called for by three Selected Recipes renders as one entry
- [x] Two Recipes calling for the same Ingredient in different units produce separate amounts on one entry, each with its own unit
- [x] An unquantified Recipe Ingredient does not become a zero in the sum
- [x] No client-side Shopping List computation remains in the frontend
- [x] A toggle appears immediately and reverts on a failed write, with the failure visible to the cook
- [x] Tests cover consolidation across Selected Recipes, summing within units, and deselection

## Comments

**The endpoint sets the flag, it does not flip it.** `PUT /api/recipes/:id/selected` takes
`{selected: boolean}` and answers 204. Both phones share one instance, so two toggles can be in
flight at once, and a flip would land in whatever order they arrived. A set is idempotent, which
makes last-write-wins correct here rather than a compromise, and a retry after a dropped response
cannot undo the write it is retrying.

Nothing comes back in the body. The caller already knows what it set, and the Shopping List the
write changes is derived, so any rollup returned from a write would be stale the moment a second
phone touched anything. The client reads the recomputed list from the next `/api/state` instead.

**Shape of a Shopping List entry.** One per Ingredient, carrying the Ingredient's own Got It mark
and Aisle, plus `amounts`: a list of `{quantity, unit}` pairs summed within each unit.

An empty `amounts` is not zero. It means every Selected Recipe calling for that Ingredient left it
unquantified, so the cook still has to buy pepper and nobody can say how much. `sum()` in SQL skips
nulls, so an unquantified Recipe Ingredient contributes nothing rather than the zero
`parseFloat(...) || 0` used to invent, and a unit that sums to null is dropped before it reaches the
wire. The frontend renders an empty `amounts` as "to taste", the same words `formatAmount` already
gave a null quantity.

**Nothing client-side was deleted, because ticket 04 had already deleted it.** It removed
`packages/web/src/shoppingList.js` along with the page that called it. This ticket verified the
absence and added no replacement: `ShoppingListPage` renders what the API hands it and performs no
grouping or arithmetic of its own.

**Got It stays read-only here.** Ticket 07 owns that toggle. The checkbox renders with the stored
mark and is disabled, following the convention `RecipeDetail` already used for the select button it
could not yet save, so nothing on screen looks like it saved when it did not.

**`test/helpers/flags.js` narrowed and grew at once.** `selected` has an endpoint now, so
`markRecipe` no longer sets it and `browse-recipes.test.js` arranges selection through the API.
Going the other way, the derivation reports an Ingredient's Got It mark and Aisle and no endpoint
sets either until ticket 07, so `markIngredient` joins the same bounded exception under ADR-0005.
Ticket 07 takes it out again.

**Two judgement calls worth a second opinion.**

`readState` runs two statements rather than one, so it reads two snapshots. A toggle landing between
them hands a client a Recipe from before it alongside a Shopping List from after. One statement, or
a repeatable-read transaction, would close that. Neither seemed worth the cost against a spec that
says every write targets an independent field and the problem is purely stale reads, and the skew
corrects itself on the next read. Recorded rather than hidden.

Entries come back ordered by Ingredient name, and the amounts within an entry by unit. Story 14
wants the list to follow the store's layout, which argues for ordering by Aisle, but Aisle is not
settable until ticket 07 and would sort every Ingredient into one null group today. Ticket 07 is
where that ordering belongs.

**From code review.** Six findings taken, two argued down.

Taken: `RECIPE_ID_MAX` moved into `packages/shared/src/schema.js`, where the migration says caps
belong, rather than sitting as a third copy of the 32 in `recipes.js`. The `recipes.js` header no
longer claims every rule in the file comes from shared, since `selectedBody` does not. `SET_SELECTED`
dropped a `returning id` nothing read. `App.jsx` renamed the local `set` to `show`. `remaining` moved
below the empty-list return in `ShoppingListPage`. And the entry count stopped saying "items":
`CONTEXT.md` lists `item` under Ingredient's _Avoid_, so it reads "3 ingredients left to buy".

Taken, and the better catch of the two reviews: `RecipesPage` held the open Recipe as a captured
object, so the detail card and its button read a copy frozen at the click. The whole reason the
endpoint takes a value rather than a flip is that a stale screen sends the opposite of what the cook
saw, and the client was reintroducing exactly that by computing `!recipe.selected` from a snapshot a
background reload never touched. It holds the id now and looks the Recipe up on every render.

Argued down: the review called "N items remaining" scope creep, absent from ticket and spec. It came
across from the pre-migration Shopping List page, which is a requirement whether or not a story wrote
it down, by the rule settled on ticket 05. The wording changed; the count stays. The review also
reported the phrase was not inherited, having grepped for a literal string that is interpolated in
both the old file and this one.

**One question for the operator, raised by the review and left as it is.** Ingredient identity folds
case, so `Onion` and `onion` are one food. Unit does not, so `2 Cups` and `1 cup` come back as two
amounts on one entry. The spec permits it, saying the summing "groups by whatever unit strings
exist", and folding would mean choosing which spelling to show back. It is asymmetric enough to look
like a bug to a cook who typed both. `treats two spellings of one unit as two amounts` pins the
current answer so the choice is deliberate; change that test if the other answer is wanted.

**Two things this ticket does not cover.** Deleting a Recipe removing it from the list is in the
spec's test list for this derivation, but the delete endpoint arrives in ticket 09 and the test goes
with it. The cascade is already in the schema. And nobody has clicked the toggle in a browser; the
suite drives Fastify through `inject`, which skips the socket, and no browser driver is installed
here.

**Loose end for whoever commits.** `packages/web/src/components/ComingWithWrites.jsx` is now
unreferenced. This ticket removed one of its two call sites and ticket 08 removed the other, so
neither can delete it alone. It should go with whichever lands second.

**Uncommitted at the time of writing.** Tickets 06, 08 and 11 were built in one working tree, and
their code is interleaved in `state.js`, `recipes.js`, `App.jsx` and `api.js`. There is no `git add`
that commits this ticket by itself, so the operator is serializing the commits by hand. Verified
green before handing over: 65 API tests across `shopping-list`, `select-recipe`, `browse-recipes` and
`create-recipe`, 23 in shared, and a clean frontend build. The whole API suite does not pass yet, for
reasons belonging to the two tickets still in flight.
