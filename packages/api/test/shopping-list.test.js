// The Shopping List: one entry per Ingredient, derived from the Selected Recipes on every read and
// never stored.
//
// The arithmetic asserted here is what the Sheets-era client got wrong. It grouped by Ingredient
// name and kept the first unit it met, so two cups plus three hundred grams rendered as one number
// wearing one of the two units. Summing within each unit and presenting a set of amount-and-unit
// pairs is the fix, and these tests are where it is pinned down.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { connect } from './helpers/database.js';
import { markIngredient } from './helpers/flags.js';
import { createRecipe, readShoppingList, setSelected } from './helpers/recipes.js';

/** The list as a cook reads it: what to buy, and how much of it. */
async function amountsByIngredient(app) {
  return Object.fromEntries(
    (await readShoppingList(app)).map((entry) => [entry.name, entry.amounts]),
  );
}

/** Creates a Recipe and marks it a Selected Recipe, which is what puts it on the list. */
async function selectRecipe(app, body) {
  const recipe = await createRecipe(app, body);
  await setSelected(app, recipe.id, true);
  return recipe;
}

describe('the Shopping List', () => {
  it('is empty when no Recipe is Selected', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    assert.deepEqual(await readShoppingList(app), []);
  });

  it('holds the Ingredients of a Selected Recipe', async (t) => {
    const app = await startApp(t);

    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Tomato', quantity: 400, unit: 'g' },
      ],
    });

    assert.deepEqual(await amountsByIngredient(app), {
      Onion: [{ quantity: 2, unit: '' }],
      Tomato: [{ quantity: 400, unit: 'g' }],
    });
  });

  it('leaves the Ingredients of an unselected Recipe off the list', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    await createRecipe(app, {
      name: 'Apple crumble',
      type: 'Dessert',
      ingredients: [{ name: 'Apple', quantity: 6, unit: '' }],
    });

    assert.deepEqual(Object.keys(await amountsByIngredient(app)), ['Onion']);
  });

  it('drops the contribution of a Recipe that is deselected', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    await setSelected(app, recipe.id, false);

    assert.deepEqual(await readShoppingList(app), []);
  });

  it('renders one Ingredient three Selected Recipes call for as one entry', async (t) => {
    const app = await startApp(t);
    for (const name of ['Minestrone', 'Ragu', 'Chilli']) {
      await selectRecipe(app, {
        name,
        type: 'Dinner',
        ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
      });
    }

    const list = await readShoppingList(app);

    assert.equal(list.length, 1);
    assert.deepEqual(list[0].amounts, [{ quantity: 3, unit: '' }]);
  });

  it('sums quantities in the same unit', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Tomato', quantity: 400, unit: 'g' }],
    });
    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Tomato', quantity: 250, unit: 'g' }],
    });

    assert.deepEqual(await amountsByIngredient(app), { Tomato: [{ quantity: 650, unit: 'g' }] });
  });

  it('keeps two units apart on one entry rather than adding them together', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Pancakes',
      type: 'Breakfast',
      ingredients: [{ name: 'Milk', quantity: 2, unit: 'cups' }],
    });
    await selectRecipe(app, {
      name: 'Bechamel',
      type: 'Dinner',
      ingredients: [{ name: 'Milk', quantity: 300, unit: 'g' }],
    });

    const list = await readShoppingList(app);

    assert.equal(list.length, 1);
    assert.deepEqual(list[0].amounts, [
      { quantity: 2, unit: 'cups' },
      { quantity: 300, unit: 'g' },
    ]);
  });

  it('does not let an unquantified Recipe Ingredient sum as a zero', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Black pepper', quantity: 4, unit: 'g' }],
    });
    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Black pepper', quantity: null, unit: 'g' }],
    });

    assert.deepEqual(await amountsByIngredient(app), {
      'Black pepper': [{ quantity: 4, unit: 'g' }],
    });
  });

  it('gives an Ingredient nothing quantifies no amount at all, rather than a zero', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Black pepper', quantity: null, unit: '' }],
    });
    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Black pepper', quantity: null, unit: '' }],
    });

    assert.deepEqual(await amountsByIngredient(app), { 'Black pepper': [] });
  });

  // Pinning a choice the spec left open rather than letting it stay whatever the SQL happened to do.
  // Ingredient identity folds case, so "Onion" and "onion" are one food; unit does not, so "Cups"
  // and "cups" are two amounts. The spec keeps unit as free text and says the summing "groups by
  // whatever unit strings exist", which permits this, and folding would mean picking which spelling
  // to show a cook back. Change this test if the operator wants the other answer.
  it('treats two spellings of one unit as two amounts, as the spec leaves it', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Pancakes',
      type: 'Breakfast',
      ingredients: [{ name: 'Milk', quantity: 2, unit: 'Cups' }],
    });
    await selectRecipe(app, {
      name: 'Porridge',
      type: 'Breakfast',
      ingredients: [{ name: 'Milk', quantity: 1, unit: 'cups' }],
    });

    const list = await readShoppingList(app);

    assert.equal(list.length, 1);
    assert.deepEqual(list[0].amounts, [
      { quantity: 2, unit: 'Cups' },
      { quantity: 1, unit: 'cups' },
    ]);
  });

  it('keeps an unquantified unit off an entry the rest of which is quantified', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Olive oil', quantity: 30, unit: 'ml' }],
    });
    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Olive oil', quantity: null, unit: 'glugs' }],
    });

    assert.deepEqual(await amountsByIngredient(app), {
      'Olive oil': [{ quantity: 30, unit: 'ml' }],
    });
  });

  it('keeps what the other Selected Recipe calls for when one is deselected', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const ragu = await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });

    await setSelected(app, ragu.id, false);

    assert.deepEqual(await amountsByIngredient(app), { Onion: [{ quantity: 2, unit: '' }] });
  });

  it('carries the Got It mark and Aisle the Ingredient itself holds onto the entry', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const [{ ingredientId }] = await readShoppingList(app);
    await markIngredient(client, ingredientId, { gotIt: true, aisle: 'Produce' });

    const [entry] = await readShoppingList(app);

    assert.equal(entry.gotIt, true);
    assert.equal(entry.aisle, 'Produce');
  });

  it('reports an Ingredient with no Aisle set as having none', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    const [entry] = await readShoppingList(app);

    assert.equal(entry.aisle, null);
    assert.equal(entry.gotIt, false);
  });

  it('names the Ingredient by its identity, so one entry answers for both spellings', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'onion ', quantity: 1, unit: '' }],
    });

    const list = await readShoppingList(app);

    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Onion');
    assert.deepEqual(list[0].amounts, [{ quantity: 3, unit: '' }]);
  });

  it('orders entries by Ingredient name, so the list reads the same way twice', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Tomato', quantity: 400, unit: 'g' },
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Basil', quantity: null, unit: '' },
      ],
    });

    const first = (await readShoppingList(app)).map((entry) => entry.name);
    const second = (await readShoppingList(app)).map((entry) => entry.name);

    assert.deepEqual(first, ['Basil', 'Onion', 'Tomato']);
    assert.deepEqual(second, first);
  });

  it('arrives with the Recipes in the one request the first paint makes', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    const response = await app.inject({ method: 'GET', url: '/api/state' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().shoppingList, [
      {
        ingredientId: 'I001',
        name: 'Onion',
        aisle: null,
        gotIt: false,
        amounts: [{ quantity: 2, unit: '' }],
      },
    ]);
  });
});
