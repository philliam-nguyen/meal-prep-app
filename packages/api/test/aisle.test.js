// Filing an Ingredient into an Aisle. A property of the Ingredient rather than of one shopping
// trip, so correcting it once is what makes it right the next time too.
//
// It is a reference now, not text: an Ingredient's Aisle is one of the managed Aisles aisles.js
// maintains, or nothing, never a spelling a cook typed. That is what closed the bug free text left
// open - "Produce", "produce" and "Veg" being three sections wearing one name - and what lets the
// picker on the Shopping List offer exactly the Aisles the Settings page manages and no others.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addAisle } from './helpers/aisles.js';
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

async function putAisle(app, ingredientId, aisleId) {
  return app.inject({
    method: 'PUT',
    url: `/api/ingredients/${ingredientId}/aisle`,
    payload: { aisleId },
  });
}

describe('filing an Ingredient into an Aisle', () => {
  it('shows on the Shopping List entry', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    const produce = await addAisle(app, 'Produce');

    await setAisle(app, ingredientId, produce.id);

    assert.equal((await entryFor(app, 'Onion')).aisleId, produce.id);
  });

  it('corrects an Aisle that was wrong', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    const bakery = await addAisle(app, 'Bakery');
    const produce = await addAisle(app, 'Produce');
    await setAisle(app, ingredientId, bakery.id);

    await setAisle(app, ingredientId, produce.id);

    assert.equal((await entryFor(app, 'Onion')).aisleId, produce.id);
  });

  // The Aisle is the Ingredient's, so it does not go with the Recipe that happened to be on the list
  // when the cook set it. That is the whole reason it survives being derived away.
  it('holds for every Recipe that calls for the Ingredient', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    const minestrone = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const ingredientId = (await entryFor(app, 'Onion')).ingredientId;
    await setAisle(app, ingredientId, produce.id);
    await setSelected(app, minestrone.id, false);

    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'onion ', quantity: 1, unit: '' }],
    });

    assert.equal((await entryFor(app, 'Onion')).aisleId, produce.id);
  });

  it('clears an Aisle set on the wrong Ingredient', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    const produce = await addAisle(app, 'Produce');
    await setAisle(app, ingredientId, produce.id);

    await setAisle(app, ingredientId, null);

    assert.equal((await entryFor(app, 'Onion')).aisleId, null);
  });

  it('refuses an id that names no Aisle, naming what it looked for', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);

    const response = await putAisle(app, ingredientId, 'A999');

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().message, 'There is no Aisle A999.');
    assert.equal((await entryFor(app, 'Onion')).aisleId, null);
  });

  it('refuses an id longer than an Aisle id could be', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);

    const response = await putAisle(app, ingredientId, 'A'.repeat(33));

    assert.equal(response.statusCode, 400);
    assert.equal((await entryFor(app, 'Onion')).aisleId, null);
  });

  it('refuses an Ingredient that is not there, naming what it looked for', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');

    const response = await putAisle(app, 'I999', produce.id);

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, 'There is no Ingredient I999.');
  });

  it('leaves the Got It mark and the amounts alone', async (t) => {
    const app = await startApp(t);
    const ingredientId = await oneIngredientOnTheList(app);
    const produce = await addAisle(app, 'Produce');

    await setAisle(app, ingredientId, produce.id);

    const entry = await entryFor(app, 'Onion');
    assert.equal(entry.gotIt, false);
    assert.deepEqual(entry.amounts, [{ quantity: 2, unit: '' }]);
  });
});
