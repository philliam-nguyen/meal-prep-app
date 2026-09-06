// Done Shopping: the cook is home, the trip is over, and the next week starts from nothing. One
// request deselects every Recipe and clears every Got It mark, because two requests can be
// interrupted between them and leave a list that is half cleared - Ingredients still on it wearing
// ticks from a shop that is finished.
//
// Everything here is read back through /api/state, which is the only place the Shopping List
// exists: it is derived on every read, so "the list is empty" is a thing to ask the API rather
// than a row to look for.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { readPantryChecklist, setPantry, setStaple } from './helpers/pantry.js';
import { createRecipe, readRecipes, readShoppingList, setSelected } from './helpers/recipes.js';
import { doneShopping, setAisle, setGotIt } from './helpers/shopping.js';

/** Creates a Recipe and marks it a Selected Recipe, which is what puts it on the list. */
async function selectRecipe(app, body) {
  const recipe = await createRecipe(app, body);
  await setSelected(app, recipe.id, true);
  return recipe;
}

/** A trip in progress: two Selected Recipes, and a tick on everything they call for. */
async function shopUntilEverythingIsTicked(app) {
  await selectRecipe(app, {
    name: 'Minestrone',
    type: 'Soup',
    ingredients: [
      { name: 'Onion', quantity: 2, unit: '' },
      { name: 'Tomato', quantity: 400, unit: 'g' },
    ],
  });
  await selectRecipe(app, {
    name: 'Apple crumble',
    type: 'Dessert',
    ingredients: [{ name: 'Apple', quantity: 6, unit: '' }],
  });
  for (const entry of await readShoppingList(app)) {
    await setGotIt(app, entry.ingredientId, true);
  }
}

describe('Done Shopping', () => {
  it('empties the Shopping List', async (t) => {
    const app = await startApp(t);
    await shopUntilEverythingIsTicked(app);

    await doneShopping(app);

    assert.deepEqual(await readShoppingList(app), []);
  });

  it('deselects every Recipe, so nothing is left feeding the list', async (t) => {
    const app = await startApp(t);
    await shopUntilEverythingIsTicked(app);

    await doneShopping(app);

    assert.deepEqual(
      (await readRecipes(app)).map((recipe) => [recipe.name, recipe.selected]),
      [
        ['Apple crumble', false],
        ['Minestrone', false],
      ],
    );
  });

  // The mark is on the Ingredient rather than on the list row, so an emptied list is not proof the
  // ticks are gone: they would come back with the Recipe. Reselecting is how a cook finds out, and
  // how this asks.
  it('clears every Got It mark, so the same Recipe comes back unticked', async (t) => {
    const app = await startApp(t);
    await shopUntilEverythingIsTicked(app);

    await doneShopping(app);

    const minestrone = (await readRecipes(app)).find((recipe) => recipe.name === 'Minestrone');
    await setSelected(app, minestrone.id, true);
    assert.deepEqual(
      (await readShoppingList(app)).map((entry) => [entry.name, entry.gotIt]),
      [
        ['Onion', false],
        ['Tomato', false],
      ],
    );
  });

  // A phone in a car park sends this and loses the reply. The retry has to be the same act rather
  // than a second one, which is what DELETE promises and what this holds it to.
  it('does nothing the second time and still succeeds', async (t) => {
    const app = await startApp(t);
    await shopUntilEverythingIsTicked(app);

    await doneShopping(app);
    await doneShopping(app);

    assert.deepEqual(await readShoppingList(app), []);
    assert.deepEqual(
      (await readRecipes(app)).map((recipe) => recipe.selected),
      [false, false],
    );
  });

  it('is content to end a trip that never started', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, { name: 'Minestrone', type: 'Soup' });

    await doneShopping(app);

    assert.deepEqual(await readShoppingList(app), []);
  });

  // It ends a shopping trip, and nothing else. The Recipes themselves, the Pantry, the Staples and
  // the Aisle an Ingredient is found in are what the kitchen is rather than what this week's list
  // was.
  it('disturbs nothing but the trip', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Salt', quantity: null, unit: '' },
      ],
    });
    const list = await readShoppingList(app);
    const onion = list.find((entry) => entry.name === 'Onion');
    const salt = list.find((entry) => entry.name === 'Salt');
    await setGotIt(app, onion.ingredientId, true);
    await setAisle(app, onion.ingredientId, 'Produce');
    await setPantry(app, onion.ingredientId, true);
    await setStaple(app, salt.ingredientId, true);

    await doneShopping(app);

    await setSelected(app, recipe.id, true);
    const entry = (await readShoppingList(app)).find((candidate) => candidate.name === 'Onion');
    assert.equal(entry.aisle, 'Produce');
    assert.deepEqual(entry.amounts, [{ quantity: 2, unit: '' }]);
    assert.deepEqual(
      (await readPantryChecklist(app)).map((checked) => [checked.name, checked.inPantry]),
      [['Onion', true]],
    );
  });
});
