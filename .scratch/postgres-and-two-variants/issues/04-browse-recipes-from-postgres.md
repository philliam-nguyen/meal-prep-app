# 04 - Browse Recipes from Postgres

Status: ready-for-agent

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

- [ ] One request returns everything the first paint needs
- [ ] Recipe list, name search and Recipe Type filter all work against API data
- [ ] Recipe detail shows each Recipe Ingredient with its quantity and unit
- [ ] An unquantified Recipe Ingredient reads as unquantified rather than as zero
- [ ] The Recipe Card opens in a new tab
- [ ] Recipe Ingredient references an Ingredient row rather than carrying a name string
- [ ] No spreadsheet read remains in the recipe browsing path
- [ ] Tests assert on API responses and on what subsequent requests report, not on internal functions
