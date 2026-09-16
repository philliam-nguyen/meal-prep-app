---
id: 0004
title: Recipe Steps and Batch
status: accepted
date: 2026-09-05
adrs: [0005, 0006, 0007, 0011]
---

# Recipe Steps and Batch

Vocabulary follows `CONTEXT.md`, with the additions recorded under Further Notes. Fourth of four
specs from the 2026-09-05 grilling session. Depends on the browser harness from the Playwright
harness spec and displays into the Selected Recipes area from the Shopping List and Aisles spec.
This spec was drafted through a local scratch tracker that is not part of the repository. This
committed copy is the authoritative content.

## Problem Statement

A Recipe in the app is a name, a Recipe Type, its Recipe Ingredients and a link to a Recipe Card
somewhere else. The instructions live only behind that link. When the link is a TikTok the steps
are in a video that has to be scrubbed while cooking; when it is a blog the steps are under ads;
when there is no link at all, which is common for Recipes captured from a photo, the app holds a
shopping list and nothing to cook from. The domain glossary says, in so many words, that the app
stores no instructions. That was a description of the spreadsheet, not a goal.

Separately, a Recipe is always cooked once. Selecting it puts one Recipe's worth of every
Ingredient on the Shopping List. Cooking a double batch means multiplying in the aisle.

## Solution

A Recipe gains an ordered list of Steps, plain text, optional. Steps are entered in the Add and
Edit forms, arrive through both file import formats when the file has an instructions section,
and are shown in the Recipe sheet in an Instructions section alongside Ingredients. The Recipe
Card link stays, optional, for Recipes that have one.

A Selected Recipe gains a Batch: a whole number from 1 to 9 saying how many times the Recipe is
being made. It is set with a stepper on the Recipe sheet next to Add to Shopping List, scales
every quantified amount on the Shopping List, shows on the Selected Recipes area of the Shopping
List page, and resets to 1 when the Recipe is deselected.

## User Stories

### Steps

1. As a cook, I want to read a Recipe's Steps in the app, so that I can cook without opening the Recipe Card.
2. As a cook, I want the Steps in order and numbered, so that I know where I am.
3. As a cook, I want the Recipe sheet to show Ingredients and Instructions as two sections, so that shopping and cooking each have their place.
4. As a cook, I want a Recipe with no Steps to show its Recipe Card link as the way to cook it, so that older Recipes are not worse than before.
5. As a cook, I want a Recipe with neither Steps nor a Recipe Card to say plainly that it has no instructions, so that I know to add them rather than think the app lost them.
6. As a cook adding a Recipe, I want to type Steps one per line, so that entry is as fast as typing them.
7. As a cook adding a Recipe, I want to add, remove and reorder Steps before saving, so that I can fix the order without retyping.
8. As a cook editing a Recipe, I want to change its Steps, so that a correction after cooking it once sticks.
9. As a cook, I want Steps to be optional, so that a Recipe that only has a Recipe Card can still be saved.
10. As a cook, I want an empty Step to be dropped on save rather than refused, so that a stray blank line does not block me.
11. As a cook, I want a Step that is too long to be refused with a clear message, so that a pasted essay does not become one Step.
12. As a cook importing a text file with an Instructions section, I want its lines to become Steps, so that a file I already have needs no retyping.
13. As a cook importing a text file with a numbered or bulleted Instructions section, I want the numbers and bullets stripped, so that the app's numbering is the only numbering.
14. As a cook importing a text file with no Instructions section, I want the import to work as it does today, so that existing files still load.
15. As a cook importing a CSV, I want an optional Instructions block after the Ingredient rows to become Steps, so that the shortcut that produces the CSV can start including them.
16. As a cook importing a CSV without that block, I want the import to work as it does today, so that existing CSVs still load.
17. As a cook, I want imported Steps to land in the form for review before saving, so that a mis-parsed line is corrected rather than stored.
18. As a cook on the Demo Variant, I want some seeded Recipes to have Steps, so that the demo shows the Instructions section.
19. As a cook, I want deleting a Recipe to take its Steps with it, so that nothing is left behind.
20. As a cook on the Demo Variant, I want Protected Recipes to keep refusing edits including to Steps, so that the guardrails still hold.

### Batch

21. As a cook, I want to say how many times I am making a Recipe when I add it to the Shopping List, so that the quantities match the cook.
22. As a cook, I want a stepper from 1 to 9 on the Recipe sheet, so that setting a Batch is two taps.
23. As a cook, I want the Shopping List quantities to scale by the Batch, so that a double batch means double the flour.
24. As a cook, I want unquantified Ingredients to stay unquantified whatever the Batch, so that "to taste" is not multiplied.
25. As a cook, I want two Selected Recipes that share an Ingredient to each contribute their own Batch-scaled amount, so that the sum is right.
26. As a cook, I want to change the Batch of an already Selected Recipe from its sheet, so that changing my mind does not mean deselecting and reselecting.
27. As a cook, I want the Batch to reset to 1 when I deselect the Recipe, so that next month's single batch does not inherit this month's triple.
28. As a cook, I want the Selected Recipes area on the Shopping List page to show each Recipe's Batch, so that I can see why the list is large.
29. As a cook, I want the Recipe sheet to show the current Batch when the Recipe is already selected, so that the stepper reflects reality.
30. As a cook, I want a Batch outside 1 to 9 to be refused by the API, so that a bad client cannot store nonsense.
31. As a cook, I want the Batch of a Recipe changed on another phone to appear on mine at the next refresh, so that the list agrees between us.

## Implementation Decisions

Rationale is included deliberately; the decisions below came out of the grilling session.

### Steps are rows, not a text blob

- A new `recipe_steps` table: Recipe id referencing recipes with cascade delete, a position
  integer, the Step text, with the pair of Recipe id and position as the key. Text is bounded by a
  length limit in the shared schema, in the low hundreds of characters, applied on both the form
  and the API as every other limit is.
- One free-text block was rejected. Separate rows cost little now and give the backlog's photo and
  video ideas a per-Step anchor later.
- Steps are plain text. No formatting, no links, no images.
- Recipe writes (create and update) take a `steps` array of strings in order. The API replaces the
  full set on every write, in the same transaction as the Recipe Ingredients, rather than offering
  per-Step endpoints. A Recipe's Steps are small and always edited together.
- The Recipe in the state response gains `steps`, an ordered array of strings.
- Recipe Card stays as `cardUrl`, optional, unchanged. Removing it was rejected because most
  existing Recipes have only a link and the TikTok workflow produces both.

### Import formats

Both parsers in the shared package gain Steps. Nothing about how they read Ingredients changes.

- **Text format**: the parser already detects a `Title:`, `Ingredients:`, `Instructions:` layout
  and already stops reading Ingredients at `Instructions:`. It now reads every non-empty line after
  that heading as a Step, stripping a leading ordinal (`1.`, `1)`, `-`, `*`) and surrounding
  whitespace.
- **CSV format**: after the Ingredient rows, an optional line whose first column is
  `Instructions:` (case-insensitive) begins a block; every non-empty line after it is one Step,
  taken whole rather than split on commas, with the same ordinal stripping. Files without the
  block parse exactly as today. A fourth column was rejected because a Step is not per-Ingredient.
- Both parsers return `steps` alongside `name` and `ingredients` in the wire shape, so a parsed
  Recipe and a typed one meet the same schema.

Example text file, which today imports the name and two Ingredients and drops the rest:

```
Title: Beef stew
Ingredients:
- 500 g beef shin
- 2 carrots
Instructions:
1. Brown the beef in batches.
2. Add carrots and stock, simmer two hours.
```

Example CSV with the optional block:

```
Ingredient,Quantity,Unit
beef shin,500,g
carrots,2,
Instructions:
Brown the beef in batches.
Add carrots and stock, simmer two hours.
```

### Batch is a column on the Recipe, meaningful only when selected

- `recipes.batch` integer, not null, default 1, check constraint 1 to 9. Deselecting a Recipe
  resets it to 1 in the same statement, so the column never carries a stale value.
- Base servings on the Recipe plus a target on selection was rejected for now. It is the better
  model but requires servings to be entered on every existing Recipe before it means anything.
- Integers only. Half batches produce amounts the display cannot show honestly.
- The Selected Recipe write gains an optional `batch`. Selecting with a Batch sets both;
  changing the Batch of an already Selected Recipe is the same write with the new number.
  Deselecting ignores any Batch sent. The response stays empty, as today, for the reason every
  Shopping List-affecting write is empty.
- The Shopping List derivation multiplies each quantified Recipe Ingredient amount by its
  Recipe's Batch before summing per Ingredient and unit. Null quantities stay null. The Recipe in
  the state response carries `batch`.

### Recipe sheet

- Two sections, Ingredients then Instructions. Whether they are stacked or tabbed is decided by a
  mock the cook approves before the sheet is rebuilt. Instructions shows numbered Steps, or the
  Recipe Card link as the fallback, or a plain "no instructions yet" line.
- A stepper (minus, count, plus) beside Add to Shopping List, bounded 1 to 9. When the Recipe is
  not selected, Add sends the stepper's value. When it is selected, changing the stepper writes
  immediately; Remove deselects and the stepper shows 1 again.
- In degraded mode the stepper is disabled with the rest of the writes.

### Forms and Seed

- The Add and Edit forms gain a Steps editor: one row per Step with remove and move up and down,
  plus an add control, in the style of the Ingredient rows. Blank rows are dropped from the
  payload before validation, as blank Ingredient rows are.
- The file drop fills the Steps rows as it fills Ingredient rows.
- The Seed gives three or four Recipes Steps. The Seed loads through the API (ADR-0007), so the
  Recipe write with Steps is exercised on every Demo restore, and the recorded Seed for degraded
  mode picks them up on the next recording.
- The spreadsheet export (ADR-0011) is unchanged. Steps do not go to the convenience copy.

### Mock before build

The Recipe sheet is the most-opened surface in the app. The ticket for it starts with a mock
produced with the design or prototype skill, approved by the cook, before React is written. The
mock is an issue in this feature's tracker directory, not spec content.

## Testing Decisions

A good test writes a Recipe the way the form does and reads it back, or drops a file and looks at
what the form shows. It does not inspect table rows or the parser's regular expressions.

HTTP seam, real Postgres (ADR-0005), following the existing create-recipe, edit-delete-recipe,
select-recipe and shopping-list tests and their helpers:

- Creating a Recipe with Steps returns them in order; updating replaces the set; an empty array
  clears them; an over-long Step is refused; a blank Step is refused at the API (the form drops
  blanks before sending).
- Deleting a Recipe removes its Steps (asserted through the absence of the Recipe, plus the
  migration's cascade).
- Selecting with a Batch scales quantified amounts and leaves null quantities null; two Selected
  Recipes sharing an Ingredient sum their scaled amounts; changing Batch on a Selected Recipe
  changes the list; deselecting resets Batch to 1; a Batch of 0 or 10 is refused.
- Protected Recipes refuse Step edits (see the guardrails test).
- Seed load produces Recipes with Steps (see the seed test).
- Migration applies from empty and from the prior schema (see the migrations test).

Shared package, following the existing recipe-files test:

- Text file with an Instructions section yields Steps with ordinals stripped; without one yields
  an empty array; the Ingredient section still stops at the heading.
- CSV with the block yields Steps taken whole including commas; without it parses as today.

Browser seam, from the Playwright harness spec:

- Open a Recipe with Steps: the Instructions section lists them numbered. Open one without: the
  fallback shows.
- Set the stepper to 2 and add to the Shopping List: the list shows doubled amounts and the
  Selected Recipes area shows the Batch.
- Add a Recipe by dropping a text file with an Instructions section: the Steps rows are filled.

## Out of Scope

- Rich text, images or links inside Steps. The backlog's agent and video ideas will revisit.
- Base servings and scaling to a target number of people.
- Half or fractional Batches.
- Per-Step endpoints or editing a single Step in place.
- Steps in the spreadsheet export.
- Changing how the Recipe Card link is captured or validated.
- An API for the TikTok shortcut to post to directly. That is the backlog's agent integration; the
  CSV block is the bridge until then.

## Further Notes

- Vocabulary changes for `CONTEXT.md`: **Step**, one ordered plain-text instruction in a Recipe,
  optional; avoid: instruction line, direction, method. **Batch**, the whole number of times a
  Selected Recipe is being made, 1 to 9, scaling its quantified amounts on the Shopping List and
  resetting to 1 on deselect; avoid: multiplier, servings, portions, scale. The Recipe definition
  drops "The app stores no instructions" and the Recipe Card definition changes from "the external
  page holding the actual cooking instructions" to an optional external source.
- The Shopping List definition's line that quantities are "always derived from the Selected
  Recipes and never stored" still holds; Batch is an input to the derivation, not a stored amount.
- Ticket breakdown suggestion: (1) migration for Steps and Batch, (2) Recipe writes and state with
  Steps and API tests, (3) Batch on select and list derivation with API tests, (4) parsers, (5)
  forms and file drop, (6) mock of the Recipe sheet, (7) Recipe sheet build with stepper, (8) Seed
  and recording, (9) browser tests, (10) CONTEXT.md amendments.
