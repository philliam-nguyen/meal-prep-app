# 05 - Add a Recipe through a shared validation module

Status: ready-for-agent

**What to build:** A cook captures a Recipe on the day they cook it, from the phone: name, Recipe
Type, Recipe Card, and a set of Recipe Ingredients with quantities and units. One validation module
defines the rules and both the API and the form import it, so server guardrails and form validation
cannot drift apart.

Naming a food an existing Recipe already uses attaches the new Recipe Ingredient to that Ingredient
rather than creating a second row, so Aisle and Pantry state stay in one place.

What a caller gets refused at the boundary: a Recipe Card that is not `https:`, a field over its
length cap, a Recipe Type outside the known set (dinner, soup, stew, dessert, bread, lunch,
breakfast, snack), a quantity outside the allowed numeric range. Unit stays free text with a length
cap and a permissive allowlist, because Recipes in the wild use inconsistent units and a strict
enumeration would fail the migration on real data.

The stored-XSS vector this closes is live today: the Recipe Card URL is free text, stored without
validation, and rendered into an anchor's `href`, which React's text escaping does not cover.

**Open question to settle in this ticket:** the current Add page also accepts a CSV or text file
upload of ingredient lines. No user story in the spec covers it. Either keep it working through the
same validation module or drop it, and record which in this file.

Ticket 04 deleted `packages/web/src/recipeFiles.js` along with the form that called it, because the
Add page became a placeholder and the parser had no caller left. That was housekeeping, not an
answer: this question is still open, and keeping the upload means restoring the file from git rather
than writing a parser again.

**Blocked by:** 04 (browse Recipes from Postgres).

- [ ] A Recipe with its Recipe Ingredients is created from the app and appears in the browse list
- [ ] A `javascript:` or `http:` Recipe Card is refused, and the form shows why
- [ ] An over-length name, an unknown Recipe Type and an out-of-range quantity are each refused
- [ ] An empty quantity stores as unquantified rather than as zero
- [ ] Adding a Recipe naming a food an existing Recipe uses does not create a second Ingredient
- [ ] The API and the form import the same validation module, with no rule written twice
- [ ] Every query in the write path is parameterized, with no string-built SQL
- [ ] Tests arrange state through this endpoint, replacing ticket 04's direct row loading
- [ ] The CSV and text upload decision is recorded here
