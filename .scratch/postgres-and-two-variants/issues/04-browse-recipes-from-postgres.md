# 04 - Browse Recipes from Postgres

Status: done

**What to build:** A cook browses all Recipes, searches by name, filters by Recipe Type, opens a
Recipe to see its Recipe Ingredients with quantities and units, and follows the Recipe Card to the
instructions. Every one of those reads comes from Postgres through the API in a single request,
replacing four parallel spreadsheet calls on load.

Ingredient becomes a row with an identity of its own rather than a free-text string compared by
lowercasing and trimming. That is what later lets Aisle and Pantry state stop fragmenting across two
spellings of one food, and what lets matching be a set operation.

Storage shape, from the spec:

| Entity | Nature | Columns |
| --- | --- | --- |
| Recipe | stored | name, Recipe Type, Recipe Card URL, Selected Recipe flag, Protected flag, timestamps |
| Ingredient | stored | canonical name, Staple flag, Aisle, Got It flag, Pantry membership, timestamps |
| Recipe Ingredient | stored | Recipe reference, Ingredient reference, quantity (numeric, nullable), unit (free text) |

A null quantity means unquantified, "to taste". The current code coerces with `parseFloat(...) || 0`,
so free text like "a pinch" already sums as zero; nullable numeric makes that explicit.

Write paths still point at the spreadsheet after this ticket and do nothing useful against the local
stack. Leave them visibly unavailable rather than silently writing somewhere the local stack never
reads. Ticket 05 restores them.

One deliberate exception to the testing convention: with no write endpoint yet, this ticket's tests
arrange state by loading rows directly. Ticket 05 converts them to arrange through the API.

**Blocked by:** 03 (walking skeleton).

- [x] One request returns everything the first paint needs
- [x] Recipe list, name search and Recipe Type filter all work against API data
- [x] Recipe detail shows each Recipe Ingredient with its quantity and unit
- [x] An unquantified Recipe Ingredient reads as unquantified rather than as zero
- [x] The Recipe Card opens in a new tab
- [x] Recipe Ingredient references an Ingredient row rather than carrying a name string
- [x] No spreadsheet read remains in the recipe browsing path
- [x] Tests assert on API responses and on what subsequent requests report, not on internal functions

## Comments

Landed on branch `postgres-migration`. `GET /api/state` returns every Recipe with its Recipe
Ingredients nested inside it, and the frontend reads nothing else. 30 tests, all green, 14 of them
new.

**Three decisions were settled with the operator before any code.** The tabs that lose their data
source keep their nav entries and render a placeholder naming what fills them, so later tickets edit
a page rather than recreate one. The payload nests Recipe Ingredients inside their Recipe, because a
Recipe Ingredient is meaningless on its own; Ingredient does not nest, because two Recipes share
one. Search and Recipe Type filtering stay in the client over that single payload, so a keystroke
costs no request.

**Primary keys are readable text, and that got an ADR.** `R001` and `I001`, minted by a sequence per
table, carrying forward the convention column A of the Recipes tab already uses. The operator
rejected uuid as overkill for a personal project and accepted the enumerability that follows.
`docs/adr/0006-text-primary-keys-from-sequences.md` records the reasoning, including the part of the
uuid argument that does not survive ADR-0003: an unguessable id would hide fake Recipes from a Demo
Visitor who is welcome to list all of them.

**The client used to mint ids and could not keep doing it.** `AddRecipePage` stripped the digits off
every loaded recipe id, took the maximum and added one. Two Demo Variant visitors saving in the same
second both compute the same id and one insert fails. Postgres mints them now.

**Browse order changed from spreadsheet order to alphabetical by name.** Ordering by id sorts `R1000`
above `R999`, and the extract carries whatever ids the spreadsheet held rather than a format the
query could rely on. Alphabetical also suits the browse list, since story 2 is finding a Recipe you
half-remember.

**Recipe Ingredients within a Recipe come back ordered by Ingredient name.** There is no column
recording the order a cook typed them in, and the spec asks for none. If cooking order turns out to
matter, that wants a position column on `recipe_ingredients` rather than a sort change.

**`recipe_ingredients` is keyed by (Recipe, Ingredient),** so one Recipe cannot list one Ingredient
twice. That is the honest model, and it is a real risk for the extract: a spreadsheet with two
`Flour` rows against one Recipe fails to load rather than loading twice. The spec expected
deduplication to surface genuine mess, and this is where it surfaces.

**A null quantity renders as "to taste" whatever the unit says.** A unit with no number in front of
it is not a quantity, so `{quantity: null, unit: "g"}` reads the same as `{quantity: null, unit: ""}`
rather than rendering a bare `g`. Data like that is worth cleaning at cutover.

**Two files this ticket deleted belong to later tickets' decisions.** `recipeFiles.js`, the CSV and
text parser, is gone because the Add page no longer renders a form; ticket 05's open question about
whether the upload survives is still open and answering it means restoring the file from git rather
than writing it again. `shoppingList.js` is gone too, which ticks one of ticket 06's checklist items
early. Neither deletion was a decision about the feature, only about not leaving unreachable code.

**ADR-0005 gained a paragraph rather than being quietly broken.** It says tests arrange state through
the API, and `test/helpers/rows.js` inserts rows directly. The exception is bounded and now recorded
in the ADR itself, because `.scratch/` does not reach `main` and a permanent decision should not be
contradicted by a comment in a file that outlives the ticket authorizing it.

**`Ingredients Match` is gone as a name.** CONTEXT.md says not to carry the combined name forward, so
the tab is `Pantry` and `IngredientsMatchPage.jsx` became `PantryPage.jsx`. Best Matches is what the
Pantry produces, not half of a tab title.

**`npm run dev` now proxies `/api` to `localhost:8080`.** A deployment serves the bundle from the API
process, so `/api` is already same-origin; the Vite dev server is the one place that is untrue.

**`docker compose up --build` still fails on this machine** with `SELF_SIGNED_CERT_IN_CHAIN`, exactly
as ticket 03 predicted after the npm CA hook was removed. Verification ran against Postgres in a
container with the API on the host instead, which exercises the same code and the same restricted
role. Building images on the homelab is unaffected.

**What a human still needs to click.** No browser driver is installed, so three checklist items were
verified by reading the code and the served bundle rather than by interacting: typing in the search
box narrows the list, tapping a Recipe Type pill filters it, and the Recipe Card anchor opens a new
tab. The anchor carries `target="_blank" rel="noopener noreferrer"` and the payload reaches the page,
so the risk is low, but nobody has clicked them.

**Not done here.** No write path of any kind, so the local app browses an empty database until the
Seed or an extract fills it. No CORS, rate limiting, body size limit or row caps: ticket 11 owns
those. No length caps or Recipe Type allowlist in the schema either, because the shared validation
module owns them and a second copy in SQL would drift. `packages/shared` still exports only
`RECIPE_TYPES`.
