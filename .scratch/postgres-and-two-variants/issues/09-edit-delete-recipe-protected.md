# 09 - Edit and delete a Recipe, with Protected enforced

Status: ready-for-agent

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

- [ ] Editing name, Recipe Type and Recipe Card persists, and ticket 05's validation applies unchanged
- [ ] A Recipe Ingredient's quantity and unit can be changed
- [ ] An edit touching only Recipe Ingredients still moves the freshness version, proven by a test
- [ ] Recipe Ingredients can be added to and removed from an existing Recipe
- [ ] Deleting a Recipe removes it from the Shopping List, proven by a test
- [ ] A Protected Recipe refuses edit and delete; an unprotected one accepts both
- [ ] No Sheets code, spreadsheet identifier, API-key screen or script URL setting remains in the repository
- [ ] The README describes the new stack and instructs nobody to share a spreadsheet by link
