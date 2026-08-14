// The Aisle an Ingredient is found in. A property of the Ingredient rather than of one shopping
// trip, so correcting it once is what makes it right the next time too.
//
// It is free text with a length cap and no allowlist: a store section is "Aisle 12", "Dairy & eggs"
// or whatever the cook writes on their own list, and an allowlist tight enough to be worth having
// would refuse half of them. Nothing here reaches an href, which is the one place React's escaping
// does not cover.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AISLE_MAX } from '@meal-prep/shared';
import { startApp } from './helpers/app.js';
import { createRecipe, readShoppingList, setSelected } from './helpers/recipes.js';
import { setAisle } from './helpers/shopping.js';

async function selectRecipe(app, body) {
  const recipe = await createRecipe(app, body);
  await setSelected(app, recipe.id, true);
  return recipe;
}

/** The list entry for one Ingredient, by the name a cook reads. */
async function entryFor(app, name) {
  const entry = (await readShoppingList(app)).find((candidate) => candidate.name === name);
  assert.ok(entry, `${name} is not on the Shopping List`);
  return entry;
}

/** A Selected Recipe with one Ingredient, and that Ingredient's id. */
async function oneIngredientOnTheList(app, name = 'Onion') {
  await selectRecipe(app, {
    name: 'Minestrone',
    type: 'Soup',
    ingredients: [{ name, quantity: 2, unit: '' }],
  });
  return (await entryFor(app, name)).ingredientId;
}

async function putAisle(app, ingredientId, aisle) {
  return app.inject({
    method: 'PUT',
    url: `/api/ingredients/${ingredientId}/aisle`,
    payload: { aisle },
  });
}

describe('setting the Aisle an Ingredient lives in', () => {
  it('shows on the Shopping List entry', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);

    await setAisle(app, ingredientId, 'Produce');

    assert.equal((await entryFor(app, 'Onion')).aisle, 'Produce');
  });

  it('corrects an Aisle that was wrong', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    await setAisle(app, ingredientId, 'Bakery');

    await setAisle(app, ingredientId, 'Produce');

    assert.equal((await entryFor(app, 'Onion')).aisle, 'Produce');
  });

  // The Aisle is the Ingredient's, so it does not go with the Recipe that happened to be on the list
  // when the cook set it. That is the whole reason it survives being derived away.
  it('holds for every Recipe that calls for the Ingredient', async (t) => {
    const app = await startApp(t);
    const minestrone = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const ingredientId = (await entryFor(app, 'Onion')).ingredientId;
    await setAisle(app, ingredientId, 'Produce');
    await setSelected(app, minestrone.id, false);

    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'onion ', quantity: 1, unit: '' }],
    });

    assert.equal((await entryFor(app, 'Onion')).aisle, 'Produce');
  });

  it('clears an Aisle set on the wrong Ingredient', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    await setAisle(app, ingredientId, 'Produce');

    await setAisle(app, ingredientId, null);

    assert.equal((await entryFor(app, 'Onion')).aisle, null);
  });

  // A cook clearing the box sends an empty string rather than a null, and means the same thing by
  // it. Storing "" would give the list an Aisle heading with no name in it.
  it('reads an emptied box as no Aisle at all', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    await setAisle(app, ingredientId, 'Produce');

    await setAisle(app, ingredientId, '   ');

    assert.equal((await entryFor(app, 'Onion')).aisle, null);
  });

  it('trims what the cook typed, so one Aisle does not arrive as two', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);

    await setAisle(app, ingredientId, '  Produce  ');

    assert.equal((await entryFor(app, 'Onion')).aisle, 'Produce');
  });

  it('keeps the punctuation a store section is actually written with', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);

    await setAisle(app, ingredientId, 'Aisle 12 - Dairy & eggs');

    assert.equal((await entryFor(app, 'Onion')).aisle, 'Aisle 12 - Dairy & eggs');
  });

  it('refuses an Aisle longer than the column holds', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);

    const response = await putAisle(app, ingredientId, 'A'.repeat(AISLE_MAX + 1));

    assert.equal(response.statusCode, 400);
    assert.equal((await entryFor(app, 'Onion')).aisle, null);
  });

  it('accepts an Aisle exactly at the cap', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    const longest = 'A'.repeat(AISLE_MAX);

    await setAisle(app, ingredientId, longest);

    assert.equal((await entryFor(app, 'Onion')).aisle, longest);
  });

  it('refuses an Ingredient that is not there, naming what it looked for', async (t) => {
    const app = await startApp(t);

    const response = await putAisle(app, 'I999', 'Produce');

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, 'There is no Ingredient I999.');
  });

  it('leaves the Got It mark and the amounts alone', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);

    await setAisle(app, ingredientId, 'Produce');

    const entry = await entryFor(app, 'Onion');
    assert.equal(entry.gotIt, false);
    assert.deepEqual(entry.amounts, [{ quantity: 2, unit: '' }]);
  });
});
