# 09 - Edit and delete a Recipe, with Protected enforced

Status: done

**What to build:** A cook fixes a typo in ten seconds instead of opening a database session. Editing
a Recipe's name, Recipe Type and Recipe Card. Editing a Recipe Ingredient's quantity or unit. Adding
and removing Recipe Ingredients so a Recipe can evolve. Deleting a Recipe, which also takes it off
the Shopping List so nobody shops for a Recipe that no longer exists.

This is the capability the spreadsheet provided by hand, and the migration removes that fallback.
Without it, the app cannot be fixed from inside itself.

A Protected row refuses edit and delete. The Homelab Variant never sets the flag, so the column sits
inert there rather than being checked conditionally (ADR-0002).

With no write path left pointing at the spreadsheet, strip what fed it: the Sheets client, the
API-key setup screen, the `SHEET_ID` constant, the script URL setting, the local cache keys, and the
README's setup and sharing instructions. Check ticket 01 for anything else it flagged for removal.

An edit has to write the Recipe row itself, even when only its Recipe Ingredients changed. Ticket 10
derives freshness from the maximum `updated_at` across Recipes and Ingredients plus row counts, and
`recipe_ingredients` carries neither: changing a quantity in place moves no timestamp and no count,
so the second phone would keep showing the old amount indefinitely. Writing the parent row moves its
timestamp through the trigger the schema already installs, which closes it. A test that changes only
a quantity and asserts the version moved is what holds it closed.

**Blocked by:** 05 (shared validation module and the recipe write path), 06 (the Shopping List, so
deletion can be asserted against it).

- [x] Editing name, Recipe Type and Recipe Card persists, and ticket 05's validation applies unchanged
- [x] A Recipe Ingredient's quantity and unit can be changed
- [x] An edit touching only Recipe Ingredients still moves the freshness version, proven by a test
- [x] Recipe Ingredients can be added to and removed from an existing Recipe
- [x] Deleting a Recipe removes it from the Shopping List, proven by a test
- [x] A Protected Recipe refuses edit and delete; an unprotected one accepts both
- [x] No Sheets code, spreadsheet identifier, API-key screen or script URL setting remains in the repository
- [x] The README describes the new stack and instructs nobody to share a spreadsheet by link

## Comments

**An edit is one endpoint, not several.** `PUT /api/recipes/:id` takes the whole Recipe, which is
what the spec means by "create, update and delete a Recipe" and what makes every other write in this
app idempotent. Field-level endpoints for a Recipe Ingredient's quantity and unit were rejected: the
form has the whole Recipe on screen, so they would be extra endpoints answering a question the
request has already answered.

**The body schema is `createRecipeBody`, unchanged.** A Recipe a cook may not create is not one they
may edit their way into, so the edit is held to ticket 05's object rather than to a copy. The name
still says "create" for the route that came first. Renaming it to `recipeBody` would be truer and
touches three importers; left alone rather than churning ticket 05's module while other tickets are
in flight.

**Protected is guarded in the statement**, `where id = $1 and not protected`, with a second query
only on the path already refusing — the shape `explainPantryRefusal` established. Checking the flag
in a read first would leave a window between the check and the write. The refusal says Protected
rather than naming a Variant, because nothing in the application knows which deployment it is
(ADR-0002).

**Selecting a Protected Recipe is still allowed**, and a test pins it. Putting a Recipe on the
Shopping List is not editing it, and a Demo Visitor who cannot shop for seeded content is being
shown a read-only tour of the one thing the app is for.

**The Sheets strip was almost entirely already done.** Tickets 02 through 08 had removed the client,
`SHEET_ID`, the API-key screen, the script URL setting and the cache keys. What remained was the
README, which still told a reader to enable the Sheets API and share the spreadsheet with anyone
holding the link. Ticket 01 lists the API key and the Apps Script deployment as things to shut down
in Cloud Console at cutover; neither was ever committed, so neither is a repository change and both
stay ticket 17's.

**An edit now sets `updated_at` itself rather than leaving it to the trigger.** The trigger fires
only when the `recipes` row differs, and `recipe_ingredients` carries no timestamp at all, so an
edit correcting a quantity changed the Recipe while leaving every timestamp where it was. Ticket 10
polls the maximum update timestamp across mutable state, so without this its first checklist item is
false for exactly the edits this ticket adds. The cost is that a rewrite changing nothing also moves
the timestamp, which is a redundant refetch; missing a real edit is a cook shopping from a wrong
list, and that is worse. Four tests pin it.

**Ticket 10 still has a hole this ticket cannot close: deleting moves no timestamp forward.** A
maximum over the rows that remain cannot see a row that is gone, so a Recipe deleted on one phone
will not make a second phone refetch. That is a property of the max-timestamp scheme rather than of
the delete endpoint, so it belongs to whoever builds the version endpoint — it needs a row count or
a record of deletions alongside the maximum. Flagged here because this ticket is what makes deletion
reachable.

**Editing removed a row cap nobody had written down, so it was restored.** Before this ticket the
only way to mint an Ingredient was creating a Recipe, and a Recipe was capped at
`RECIPE_INGREDIENTS_MAX` of them and could never be deleted, so the table could never hold more than
every Recipe's worth. Editing breaks that on its own — a Recipe rewritten with a hundred new foods
leaves the old hundred behind and can be rewritten again — and deleting hands Recipe slots back on
top. The ceiling is now `RECIPES_MAX * RECIPE_INGREDIENTS_MAX`, checked under the advisory lock the
Recipe cap already takes and after the upserts, since only they know how many of the named foods
were already there. Derived rather than configured, because it is the bound that already existed
rather than a new policy: no wrapper has to learn a setting. Found in code review against ADR-0001.

**The ceiling was fifty times past the point the schema broke, which was ticket 19, now fixed.**
`lpad` truncates rather than only padding, so `ingredients.id` and `recipes.id` collided on every
value past 999 while the default ceiling was 50000. The cap would have been dead weight. Ticket 19
landed `0003_readable_ids_past_999.sql` in the same branch, and this ticket's ceiling suite now
carries a test that fills past the thousandth Ingredient to prove the ceiling is what stops the
write.

**Known sharp edge, not fixed.** A client sending `Content-Type: application/json` with no body on
`DELETE /api/recipes/:id` gets Fastify's `FST_ERR_CTP_EMPTY_JSON_BODY` 400 rather than the delete.
The app's own client sends no content-type and is unaffected. Fixing it means replacing the JSON
body parser, which is the surface ticket 11 hardened, so it is left alone deliberately rather than
overlooked.

**Not covered by tests: the React wiring.** The suite is HTTP against real Postgres by ADR-0005 and
the frontend has no component tests, so the Edit page, the delete confirmation and the Add form
refactor are covered by the build and by a manual run of the stack, not by an automated test. This
is the same gap ticket 05's Add form has.
