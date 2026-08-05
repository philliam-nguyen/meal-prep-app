# Meal Prep

A personal meal-planning app: keep a collection of recipes, pick which ones you're cooking,
get a consolidated shopping list, and find out what you can cook from what's already in the
kitchen.

## Language

### Recipes

**Recipe**:
A dish, identified by a stable id, with a name, a Recipe Type, and a set of Recipe Ingredients.
The app stores no instructions — it links out to a Recipe Card.

**Recipe Type**:
The single category a Recipe belongs to, drawn from a fixed set (dinner, soup, stew, dessert,
bread, lunch, breakfast, snack).
_Avoid_: category, tag, meal, cuisine

**Recipe Card**:
The external page holding the actual cooking instructions. The app only ever holds its URL.
_Avoid_: link, recipe url, instructions

**Recipe Ingredient**:
The quantity and unit of one Ingredient within one Recipe. Meaningless on its own — it exists
only as part of a Recipe.
_Avoid_: line item, recipe row, ingredient row

### Ingredients and the kitchen

**Ingredient**:
A distinct food item with an identity of its own, referenced by Recipes and by kitchen state.
Two spellings of the same food are the same Ingredient.
_Avoid_: item, food, product, ingredient name

**Staple**:
An Ingredient assumed to always be on hand. Staples never appear in the Pantry checklist and
are never counted as Missing.
_Avoid_: basic, common ingredient, always-have

**Pantry**:
The set of Ingredients currently on hand. A simple membership question with no quantities —
you either have an Ingredient or you don't.
_Avoid_: inventory, stock, have-list, on-hand list

**Aisle**:
The store section an Ingredient is found in. A property of the Ingredient itself, not of any
one shopping trip.

### Shopping

**Selected Recipe**:
A Recipe the cook has committed to making, which is what pulls its Ingredients into the
Shopping List.
_Avoid_: active recipe, in cart, added recipe

**Shopping List**:
The consolidated Ingredients needed for every Selected Recipe, each with its summed quantity.
The quantities are always derived from the Selected Recipes and never stored; only the Got It
mark and the Aisle persist.
_Avoid_: grocery list, cart, basket

**Got It**:
A mark on a Shopping List entry meaning it's already in the trolley. Survives between sessions
and is shared by everyone using the instance.
_Avoid_: checked, purchased, done, acquired

### Matching

**Best Match**:
A Recipe ranked by how few of its Ingredients are Missing, lowest first. Recipes with nothing
in the Pantry are not Best Matches at all.
_Avoid_: suggestion, recommendation, what can I make

**Missing Ingredients**:
The non-Staple Ingredients a Recipe needs that aren't in the Pantry. An empty set means the
Recipe is cookable right now.
_Avoid_: needed, shortfall, "Nothing Missing"

> The spreadsheet tab named `Ingredients Match` is two unrelated things wearing one name: the
> Pantry (what you have, an input) and Best Matches (what that implies, an output). Don't carry
> the combined name forward.

### Deployment vocabulary

**Variant**:
One of the two deployments of this single codebase. Variants differ only in infrastructure and
configuration — never in application behaviour.
_Avoid_: version, environment, edition, flavour

**Homelab Variant**:
The instance holding real personal data, reachable only over a private network. The one that
actually gets used.
_Avoid_: prod, production, personal version

**Demo Variant**:
The public instance, populated only with Seed data, existing to demonstrate the app and its
infrastructure. It must never be able to reach personal data.
_Avoid_: staging, dev, test, showcase

**Seed**:
The fixture dataset the Demo Variant is populated with, and restored to on a schedule.
_Avoid_: sample data, test data, dummy data, fake data

**Protected**:
A mark on a seeded row meaning it cannot be edited or deleted. Only ever set in the Demo
Variant; the Homelab Variant leaves it unset so it has no effect there.
_Avoid_: locked, readonly, system row
