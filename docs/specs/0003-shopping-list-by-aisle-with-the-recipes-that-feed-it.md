---
id: 0003
title: Shopping List by Aisle, with the Recipes that feed it
status: accepted
date: 2026-09-05
adrs: [0005, 0006, 0007]
---

# Shopping List by Aisle, with the Recipes that feed it

Vocabulary in this document follows `CONTEXT.md`, with the additions recorded under Further Notes.
Decisions marked with an ADR reference are recorded permanently in `docs/adr/`.

This spec was drafted through a local scratch tracker that is not part of the repository. This
committed copy is the authoritative content. It is the second of four specs from the 2026-09-05
design session; the first, Browser test harness and swipe-to-close, is the harness this one
depends on.

## Problem Statement

The Shopping List shows what to buy but not why. It is derived from the Selected Recipes, yet the
page never says which Recipes those are. To take a Recipe off the list the cook has to remember
which Recipes are selected, go back to the Recipes page, find each one, open its sheet and tap
Remove. There is no way to say "the week is over, start fresh" short of doing that for every
Recipe and then separately clearing every Got It mark. The cook's experience is that items cannot
be removed from the list at all.

The list is also in no useful order. Aisle exists as free text on each Ingredient and shows as a
label under each entry, but the list itself is a flat sequence. In the store the cook scans the
whole list on every aisle. Free text also means "Produce", "produce" and "Veg" are three Aisles,
and nothing about the text says which order the store is walked in.

Nothing in the Homelab Variant has an Aisle set today, so there is no existing data to preserve.

## Solution

The Shopping List page shows the Selected Recipes it is built from at the top, each with a remove
control, and a single Done Shopping action that deselects every Recipe and clears every Got It
mark behind one confirmation. Removing a Recipe clears the Got It mark only on Ingredients that
leave the list because of it; an Ingredient another Selected Recipe still needs keeps its mark and
shows its reduced quantity.

Aisle becomes a first-class thing: a managed list with a position, edited on the Settings page.
The Shopping List is grouped by Aisle in position order, with Ingredients that have no Aisle in a
final group. Each entry's Aisle is set from a picker rather than typed. A bulk view on Settings
lists every Ingredient with its Aisle, filterable to the unassigned, so the initial sort can be
done in one sitting rather than one shopping trip at a time.

## User Stories

### Seeing and removing what feeds the list

1. As a cook, I want the Shopping List page to show which Recipes are selected, so that I know why each Ingredient is on the list.
2. As a cook, I want to remove a Recipe from the list directly on the Shopping List page, so that I do not have to hunt for it on the Recipes page.
3. As a cook, I want removing a Recipe to shrink the quantities of Ingredients other Selected Recipes still need, so that the list stays accurate for what I am still cooking.
4. As a cook, I want an Ingredient that no Selected Recipe needs any more to leave the list and lose its Got It mark, so that it does not come back pre-ticked weeks later.
5. As a cook, I want an Ingredient that another Selected Recipe still needs to keep its Got It mark, so that removing one Recipe mid-trip does not undo ticks I earned.
6. As a cook, I want a Done Shopping action that deselects every Recipe and clears every Got It mark, so that the next week starts from nothing in one tap.
7. As a cook, I want Done Shopping to ask once before it acts, so that a mis-tap in the car park does not wipe the list.
8. As a cook, I want the Selected Recipes area to show the Batch count for each Recipe once that feature exists, so that the list and its inputs are visible together.
9. As a cook, I want the Selected Recipes area to reflect a Recipe selected from another phone on the next refresh, so that two people shopping see the same list.
10. As a cook in degraded mode, I want the Selected Recipes area to be visible but its controls disabled, so that the page reads the same offline and does not invite a write that would evaporate.

### Aisles as a managed list

11. As a cook, I want a fixed list of Aisles to choose from, so that the same section of the store is never spelled two ways.
12. As a cook, I want to add an Aisle on the Settings page, so that my store's sections are the ones on offer.
13. As a cook, I want to rename an Aisle, so that fixing a name does not mean reassigning every Ingredient in it.
14. As a cook, I want to reorder Aisles, so that the list follows the route I walk through the store.
15. As a cook, I want to remove an Aisle, so that a section I no longer use stops appearing in the picker.
16. As a cook, I want Ingredients in a removed Aisle to become unassigned rather than the removal being refused, so that tidying the list is never blocked.
17. As a cook, I want two Aisles with the same name to be refused, so that the picker never shows a duplicate.
18. As a cook on the Demo Variant, I want the Seed's Aisles to be present and in a sensible order, so that the demo shows a grouped list without setup.

### The grouped list

19. As a cook in the store, I want the Shopping List grouped under Aisle headings in position order, so that I read one group per aisle and move on.
20. As a cook, I want Ingredients with no Aisle grouped last under their own heading, so that I can see what still needs sorting without it interrupting the walk.
21. As a cook, I want Got It entries to sink to the bottom of their Aisle group, so that what is left to find in this aisle is at the top.
22. As a cook, I want the remaining count at the top to keep counting Ingredients not yet Got It, so that the summary means the same thing it always did.
23. As a cook, I want to set an entry's Aisle from a picker on the Shopping List, so that standing in the aisle I can file the Ingredient without typing.
24. As a cook, I want to clear an entry's Aisle from the same picker, so that a wrong filing can be undone.
25. As a cook, I want an Ingredient to move to its new group as soon as I file it, so that the list I am reading stays in store order.
26. As a cook, I want an empty Aisle to show no heading, so that the list is only as long as what I am buying.

### Bulk assignment

27. As a cook, I want a Settings view listing every Ingredient with its Aisle, so that I can sort the whole kitchen in one sitting.
28. As a cook, I want to filter that view to unassigned Ingredients, so that the initial sort shows only what is left.
29. As a cook, I want to search that view by Ingredient name, so that I can find one Ingredient among a hundred.
30. As a cook, I want to set an Aisle from that view with the same picker the Shopping List uses, so that there is one way to file an Ingredient.
31. As a cook, I want Staples to appear in the bulk view, so that an Ingredient that later stops being a Staple already has an Aisle.
32. As an operator, I want to assign Aisles to every Ingredient in the Homelab Variant with an agent's help through the API, so that the initial sort is not typed by hand.

## Implementation Decisions

Rationale is included deliberately; the decisions below came out of the grilling session.

### Aisle becomes a table

- A new `aisles` table: readable text id from a sequence in the style the other tables use
  (ADR-0006), a name unique case-insensitively and trimmed the way Ingredient names are, and an
  integer position.
- `ingredients.aisle` (free text) is replaced by a nullable reference to `aisles`. Deleting an
  Aisle sets the reference null. The existing free-text values are dropped in the migration; the
  Homelab Variant has none set, and the Demo Variant is reseeded on a schedule.
- Position is a dense integer maintained by the API: reorder is a single request carrying the full
  ordered list of Aisle ids, and the API rewrites every position in one transaction. A client never
  sends individual position numbers.
- A hardcoded list in the shared package, in the style of Recipe Types, was rejected. Recipe Types
  are a closed set by nature; a store's sections are not, and the Seed's store is not the cook's.
- Refusing deletion while Ingredients are assigned was considered and rejected in favour of
  unassigning them. The initial sort is being done with an agent, so a mistaken removal is cheap to
  recover from and a refusal would block tidying.

### API contract

- Aisle CRUD: list, create, rename, delete, and one reorder endpoint. Create and rename validate
  the name against the same length limit the free-text Aisle had. Duplicate names are refused with
  a conflict.
- The per-Ingredient Aisle write changes from a text body to an Aisle id or null. The response
  stays empty for the reason the other Ingredient writes are empty: the Shopping List is derived,
  and a rollup answered from a write would be stale.
- The state response gains an `aisles` array in position order, and each Shopping List entry
  carries its Aisle id rather than text. Grouping is done by the client from these two, so the API
  keeps returning one flat derived list.
- The state response gains an `ingredients` array (every Ingredient, its Aisle id, whether it is a
  Staple) to feed the bulk view. Pantry membership is already exposed through the Pantry checklist
  and is not duplicated here.
- A new Done Shopping endpoint deselects every Recipe and clears every Got It mark in one
  transaction. It is a single operation rather than two client calls so a dropped response cannot
  leave the list half-cleared. It is idempotent.
- Deselecting a Recipe now also clears Got It on every Ingredient that no longer belongs to any
  Selected Recipe, in the same transaction as the deselect. This is a rule change from the
  original Postgres spec, which said nothing but the explicit button clears Got It; the reason
  that rule existed (adding a forgotten Recipe mid-trip must not wipe ticks) is preserved, because
  adding never clears anything and removing only clears what left the list.
- Guardrails: in the Demo Variant, Protected rows cannot be edited or deleted (ADR-0001). Seeded
  Aisles are Protected; Aisle assignment on a Protected Ingredient follows whatever the existing
  Ingredient writes allow today, unchanged.

### Seed

The Seed already carries an Aisle vocabulary keyed by Ingredient name. It loads that vocabulary as
Aisle rows in a fixed, store-walk order (Produce first, Drinks last, or similar), then assigns
Ingredients by reference. Seeding continues to go through the API (ADR-0007), so the Aisle
endpoints are exercised by every Demo restore.

### Shopping List page

- A Selected Recipes area above the list: one row per Selected Recipe with its name, Recipe Type
  badge, a remove control, and, once the Recipe Steps and Batch spec lands, its Batch count. The
  layout is mocked and agreed before it is built; see the ticket requirement below.
- Done Shopping is one action with an inline confirmation, in the style of the existing Clear all
  Got It marks control, which it replaces. The old control's endpoint remains for the API but has
  no UI.
- Entries are rendered in groups by Aisle position, unassigned last. Within a group, not-Got-It
  first, then Got It, each sub-group in the order the API returned. Group headings are the Aisle
  name; the unassigned heading says so plainly.
- The Aisle label under each entry becomes a picker (a native select is acceptable) listing every
  Aisle plus a clear option. The optimistic update that Got It already does applies: the entry
  moves group before the write returns, and reverts on failure with the existing toast.

### Settings page

- An Aisles section: the ordered list with add, rename, reorder and remove. Reorder can be up and
  down buttons rather than drag; drag is a nicety, not a requirement.
- An Ingredients by Aisle section: every Ingredient, its Aisle picker, a search box and an
  unassigned filter. Same picker component as the Shopping List.

### Mock before build

The Selected Recipes area and the grouped list change the page cooks look at most. The ticket for
that view starts with a mock the cook approves, produced with the design or prototype skill, before
any React is written. The mock is an issue in this feature's tracker directory, not spec content.

## Testing Decisions

A good test asks the API to do what a cook does and reads the next state: it does not inspect
tables or component internals. A good browser test looks at what is on the page.

HTTP seam, real Postgres (ADR-0005), following the existing shopping-list, got-it, select-recipe
and aisle tests and their helpers:

- Creating, renaming, reordering and deleting Aisles; duplicate name refused; delete unassigns.
- State returns Aisles in position order and each entry's Aisle id; a reorder changes the order
  the next state returns.
- Assigning an Aisle by id; assigning an unknown id is refused; clearing to null works.
- Deselecting a Recipe clears Got It on Ingredients that left the list and leaves it on Ingredients
  another Selected Recipe still needs, whose amounts have shrunk.
- Done Shopping empties the list and clears every mark; a second call is a no-op.
- Demo guardrails: seeded Aisles cannot be renamed or deleted (see the guardrails test).
- Seed load produces the expected Aisles in order with Ingredients assigned (see the seed test).
- Migration applies from empty and from the prior schema (see the migrations test).

Browser seam, from the Playwright harness spec:

- The Shopping List shows the Selected Recipes; removing one removes its Ingredients and the list
  regroups.
- Done Shopping asks, then empties the page to the existing empty state.
- Filing an entry into an Aisle from the picker moves it under that heading.

Frontend grouping is a pure function over the state response and gets a unit test in the web
package alongside the existing pure-module tests.

## Out of Scope

- Per-Ingredient hide or skip on the Shopping List. The Pantry views spec covers "I already have
  this"; removing a Recipe covers "I am not making that."
- Store-specific Aisle orders (one order per shop). One order per instance.
- Drag-to-reorder Aisles. Up and down controls are sufficient.
- Performing the initial Aisle assignment for the Homelab Variant. That is an operator task done
  on the homelab with an agent through the bulk view or the API, after this ships.
- Exporting Aisles to the spreadsheet convenience copy (ADR-0011) beyond whatever the Aisle column
  already carries as text.
- Batch counts themselves; the area only displays them once the Recipe Steps and Batch spec lands.

## Further Notes

- Vocabulary changes for `CONTEXT.md`: **Aisle** becomes an entity with a name and a position
  rather than a text property; **Done Shopping** is the act of deselecting every Recipe and clearing
  every Got It mark. The Got It definition gains "cleared when its Ingredient leaves the Shopping
  List." The original Postgres spec's statement that nothing but the explicit button clears Got It
  should be amended in the doc consistency style used before.
- The Clear all Got It marks endpoint stays for compatibility with the Seed recording and any
  script that calls it, but the UI control is replaced by Done Shopping.
- Ticket breakdown suggestion: (1) migration and Aisle table with API and tests, (2) Ingredient
  Aisle by id and state changes, (3) Done Shopping and Got It clearing on deselect, (4) Seed
  update, (5) mock of the Shopping List page, (6) Shopping List page build, (7) Settings sections,
  (8) browser tests, (9) CONTEXT.md and spec amendments.
