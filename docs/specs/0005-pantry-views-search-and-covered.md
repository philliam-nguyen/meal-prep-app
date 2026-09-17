---
id: 0005
title: Pantry views, search, and Covered Shopping List entries
status: accepted
date: 2026-09-05
adrs: [0005]
---

# Pantry views, search, and Covered Shopping List entries

Vocabulary in this document follows `CONTEXT.md`, with the additions recorded under Further Notes.
Decisions marked with an ADR reference are recorded permanently in `docs/adr/`.

This spec was drafted through a local scratch tracker that is not part of the repository. This
committed copy is the authoritative content. It is the third of four specs from the 2026-09-05
design session, and depends on the browser harness from
[Spec 0002](0002-browser-test-harness-and-swipe-to-close.md).

## Problem Statement

The Pantry is one long checklist of every non-Staple Ingredient the app knows, ticked or not. As
the Recipe collection grows the list grows with it, and finding one Ingredient to tick means
scrolling past everything. There is no way to see at a glance what is in the kitchen as a list of
its own, and no way to search.

The Pantry also does not talk to the Shopping List. Selecting a Recipe puts every one of its
non-Staple Ingredients on the list, including the ones the Pantry says are already in the kitchen.
The cook either buys them again or ticks them Got It by hand before leaving the house, which is a
lie about the trolley that has to be remembered next week.

## Solution

The Pantry page shows two views over the same set of Ingredients: what is in the Pantry and what is
not. One search box filters both at once. Staples stay in their existing fold and out of both
views and the search. Best Matches stays on the page below, as the output the Pantry produces.

A Shopping List entry whose Ingredient is in the Pantry shows as Covered. Covered is derived from
Pantry membership every time the list is read, never written. It is shown distinctly from Got It,
sinks with Got It to the bottom of its group, and does not count toward the remaining total.
Nothing flows the other way: buying something does not put it in the Pantry.

## User Stories

### Two views

1. As a cook, I want a view of what is in the Pantry, so that I can see what the kitchen holds without reading the whole checklist.
2. As a cook, I want a view of what is not in the Pantry, so that I can tick what I just noticed on the shelf.
3. As a cook, I want to move an Ingredient from not-in-Pantry to in-Pantry with one tap, so that taking stock is quick.
4. As a cook, I want to move an Ingredient out of the Pantry with one tap, so that using the last of something is recorded as fast as noticing it.
5. As a cook, I want each view to show how many Ingredients it holds, so that I know how much stock I have and how much is left to consider.
6. As a cook, I want the two views to be reachable without either dominating the screen, so that the page is still easy to use on a phone.
7. As a cook, I want an Ingredient I just moved to appear in the other view immediately, so that the page never shows it in both or neither.
8. As a cook, I want Staples excluded from both views, so that things I always have do not clutter stock-taking.
9. As a cook, I want the existing Staples fold to keep working, so that marking and unmarking a Staple is unchanged.
10. As a cook on the Demo Variant, I want the Seed's Pantry to populate both views, so that the demo shows the feature without setup.

### Search

11. As a cook, I want one search box on the Pantry page, so that I can find an Ingredient by typing part of its name.
12. As a cook, I want the search to filter both views at once, so that I do not have to know which side the Ingredient is on.
13. As a cook, I want the search to ignore case and surrounding whitespace, so that "Chick" finds "chickpeas".
14. As a cook, I want a clear control on the search, so that I can get the full lists back in one tap.
15. As a cook, I want a view with no matches to say so rather than vanish, so that I know the search worked and found nothing.
16. As a cook, I want the search to leave Best Matches alone, so that filtering the list does not change what I can cook.
17. As a cook, I want the search to leave Staples alone, so that the fold shows what it always shows.

### Best Matches

18. As a cook, I want Best Matches to stay on the Pantry page, so that what I have and what it implies are still read together.
19. As a cook, I want Best Matches to update as I move Ingredients between views, so that the page keeps behaving as it does today.

### Covered entries on the Shopping List

20. As a cook, I want a Shopping List entry whose Ingredient is in the Pantry to show as Covered, so that I do not buy what I already have.
21. As a cook, I want Covered to look different from Got It, so that I can tell "already at home" from "already in the trolley".
22. As a cook, I want Covered entries to sink to the bottom of their Aisle group with the Got It entries, so that what I still need to find is on top.
23. As a cook, I want the remaining count to exclude Covered entries, so that the number is what I actually have to buy.
24. As a cook, I want Covered to disappear from an entry the moment I remove its Ingredient from the Pantry, so that using the last of something at home puts it back on the list.
25. As a cook, I want Covered to be unaffected by Done Shopping and by clearing Got It marks, so that Pantry truth survives the end of a trip.
26. As a cook, I want to still be able to mark a Covered entry Got It, so that buying more of something I have is not forbidden.
27. As a cook, I want Covered to show up the same way on both phones, so that two people shopping agree on what to skip.
28. As a cook, I want an Ingredient that is both in the Pantry and needed by a Recipe to still count as not Missing for Best Matches, so that the two rules agree.

## Implementation Decisions

Rationale is included deliberately; the decisions below came out of the grilling session.

### Covered is derived, never stored

- A Shopping List entry is Covered when its Ingredient is in the Pantry. The API computes it in
  the same derivation that builds the Shopping List and returns it as a boolean on each entry.
- Writing Got It when a Recipe is selected was rejected. It would break the moment Got It marks
  were cleared, would disagree with the Pantry the moment the Pantry changed mid-trip, and would
  make Got It mean two things.
- No reverse flow. Marking Got It does not add to the Pantry, because cooking consumes what was
  bought and an automatic Pantry would be wrong within a week. The Pantry remains something the
  cook maintains by hand.
- The remaining count is computed by the client as entries that are neither Got It nor Covered.

### API contract

- The state response's Shopping List entry gains `covered`. Nothing else changes on the wire for
  this; Pantry membership writes already exist.
- The Pantry checklist already returned in state is the input to both views; the client splits it
  by membership. No new endpoint for the two views.
- Search is client-side over the Pantry checklist already in memory. The list is hundreds of rows
  at most; a search endpoint would add latency for nothing.

### Pantry page

- Two views over the same checklist, split by membership, plus the existing Staples fold and Best
  Matches below. Whether the two views are tabs, a segmented control, or stacked collapsible
  sections is decided by a mock the cook approves before the page is built. The constraint from
  the grilling session: neither view may take over the screen, and the whole page must stay easy
  on a phone.
- One search box above both views. Filtering is by case-insensitive, trimmed substring on the
  Ingredient name, matching how Ingredient names are canonicalised in the schema.
- Moving an Ingredient between views uses the existing Pantry membership write with the same
  optimistic update the checklist already does.
- Empty view states: a view with nothing in it says so; a view with nothing matching the search
  says that instead. In degraded mode both views render with their controls disabled, as the
  checklist does today.

### Shopping List page

- A Covered entry renders with a distinct marker (a house or pantry glyph and the word Covered, or
  similar) in place of an unticked box, and a muted style like Got It. The Got It control remains
  usable on it.
- Sort within an Aisle group, building on the Shopping List and Aisles spec: entries that are
  neither Got It nor Covered first, then the rest in the API's order.

### Mock before build

The Pantry page layout is the open UI question in this spec. The ticket for the page starts with a
mock produced with the design or prototype skill, approved by the cook, before React is written.
The mock is an issue in this feature's tracker directory, not spec content.

## Testing Decisions

A good test asks the API to do what a cook does and reads the next state, or looks at what the
page shows. It does not inspect how the client splits a list or which glyph it chose.

HTTP seam, real Postgres (ADR-0005), following the existing pantry-and-best-matches, shopping-list
and got-it tests and their helpers:

- Selecting a Recipe whose Ingredient is in the Pantry returns that entry Covered; one whose
  Ingredient is not returns it uncovered.
- Removing the Ingredient from the Pantry flips Covered on the next read without any other write.
- Clearing Got It marks and Done Shopping leave Covered unchanged (Done Shopping empties the list,
  so the assertion is on re-selecting the Recipe afterwards).
- Got It can be set on a Covered entry and both flags are returned.
- A Staple is never on the list and so never Covered (existing behaviour, asserted once).

**Amendment, 2026-09-16: the bullet above is half wrong about a Staple's Shopping List entry.**
The implementation that landed keeps a Staple's entry on the Shopping List — `SHOPPING_LIST_QUERY`
in `packages/api/src/state.js` carries no staple filter, and `got-it.test.js`'s "marking the same
Ingredient a Staple" test depends on that entry staying reachable after the switch. What holds
instead, and what `packages/api/test/covered.test.js` asserts, is narrower and enforced one layer
down: `ingredients.js`'s `not staple` guard on the Pantry write means a Staple can never be ticked
into the Pantry, so its Shopping List entry is never Covered. The list membership was never the
guarantee; the Pantry guard is.

Browser seam, from the Playwright harness spec:

- The Pantry page shows an Ingredient in the not-in-Pantry view; tapping it moves it to the
  in-Pantry view and the counts change.
- Typing in the search narrows both views; clearing restores them.
- The Shopping List shows a Covered entry distinctly and the remaining count excludes it.

The client-side split and filter are pure functions over the state response and get a unit test in
the web package alongside the existing pure-module tests.

## Out of Scope

- Quantities in the Pantry. The Pantry stays a membership question, as `CONTEXT.md` defines it.
- Automatic Pantry updates from purchases or from cooking a Recipe.
- Hiding Covered entries from the list. They are shown and sunk, not removed, so the cook can see
  what the Pantry claims and override it.
- A household inventory of non-food items. That is a backlog item with its own future spec.
- Server-side search or pagination of the Pantry.
- Adding Ingredients to the Pantry that no Recipe references. The Pantry is over Ingredients the
  app already knows.

## Further Notes

- Vocabulary changes for `CONTEXT.md`: **Covered**, a Shopping List entry whose Ingredient is in
  the Pantry; derived on every read, shown distinctly from Got It, never stored. Avoid: in stock,
  have it, skip. The Pantry definition gains a line that it is presented as two views, in and not
  in, over the same set.
- The draft that led to this spec used the word "inventory". `CONTEXT.md` lists that as a term to
  avoid; everything here is the Pantry.
- Ticket breakdown suggestion: (1) Covered in the state derivation with API tests, (2) Covered on
  the Shopping List page, (3) mock of the Pantry page, (4) Pantry page build with search, (5)
  browser tests, (6) CONTEXT.md amendments.
