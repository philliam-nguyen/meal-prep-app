// The Shopping List: one entry per Ingredient, derived from the Selected Recipes on every read and
// never stored.
//
// The arithmetic asserted here is what the Sheets-era client got wrong. It grouped by Ingredient
// name and kept the first unit it met, so two cups plus three hundred grams rendered as one number
// wearing one of the two units. Summing within each unit and presenting a set of amount-and-unit
// pairs is the fix, and these tests are where it is pinned down.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addAisle } from './helpers/aisles.js';
import { startApp } from './helpers/app.js';
import { createRecipe, readShoppingList, setSelected } from './helpers/recipes.js';
import { setAisle, setGotIt } from './helpers/shopping.js';

/** The list as a cook reads it: what to buy, and how much of it. */
async function amountsByIngredient(app) {
  return Object.fromEntries(
    (await readShoppingList(app)).map((entry) => [entry.name, entry.amounts]),
  );
}

/**
 * Creates a Recipe and marks it a Selected Recipe, which is what puts it on the list. A Batch says
 * how many times it is being made; without one the Recipe is made once, as every Recipe was before
 * Batch existed.
 */
async function selectRecipe(app, body, batch) {
  const recipe = await createRecipe(app, body);
  await setSelected(app, recipe.id, true, batch);
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
    const produce = await addAisle(app, 'Produce');
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const [{ ingredientId }] = await readShoppingList(app);
    await setGotIt(app, ingredientId, true);
    await setAisle(app, ingredientId, produce.id);

    const [entry] = await readShoppingList(app);

    assert.equal(entry.gotIt, true);
    assert.equal(entry.aisleId, produce.id);
  });

  it('reports an Ingredient with no Aisle set as having none', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    const [entry] = await readShoppingList(app);

    assert.equal(entry.aisleId, null);
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
        aisleId: null,
        gotIt: false,
        covered: false,
        amounts: [{ quantity: 2, unit: '' }],
      },
    ]);
  });
});

// The Batch multiplies. A cook making a double batch of stew needs twice the beef, and the
// arithmetic belongs in the same query that sums the amounts rather than in a second place that
// could disagree with it - which is the defect this whole derivation was built to remove.
describe('the Shopping List and the Batch', () => {
  it('multiplies a quantified amount by the Batch', async (t) => {
    const app = await startApp(t);

    await selectRecipe(
      app,
      {
        name: 'Minestrone',
        type: 'Soup',
        ingredients: [
          { name: 'Onion', quantity: 2, unit: '' },
          { name: 'Tomato', quantity: 400, unit: 'g' },
        ],
      },
      3,
    );

    assert.deepEqual(await amountsByIngredient(app), {
      Onion: [{ quantity: 6, unit: '' }],
      Tomato: [{ quantity: 1200, unit: 'g' }],
    });
  });

  it('leaves an unquantified Recipe Ingredient unquantified whatever the Batch', async (t) => {
    const app = await startApp(t);

    await selectRecipe(
      app,
      {
        name: 'Minestrone',
        type: 'Soup',
        ingredients: [
          { name: 'Black pepper', quantity: null, unit: '' },
          { name: 'Onion', quantity: 2, unit: '' },
        ],
      },
      4,
    );

    assert.deepEqual(await amountsByIngredient(app), {
      'Black pepper': [],
      Onion: [{ quantity: 8, unit: '' }],
    });
  });

  it('gives two Selected Recipes sharing an Ingredient their own Batch each', async (t) => {
    const app = await startApp(t);
    await selectRecipe(
      app,
      {
        name: 'Minestrone',
        type: 'Soup',
        ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
      },
      3,
    );
    await selectRecipe(
      app,
      {
        name: 'Ragu',
        type: 'Dinner',
        ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
      },
      2,
    );

    // Six onions for three pots of minestrone and two for two pans of ragu, which is eight. One
    // factor applied to the sum would have said either fifteen or ten.
    assert.deepEqual(await amountsByIngredient(app), { Onion: [{ quantity: 8, unit: '' }] });
  });

  it('changes the list when the Batch of an already Selected Recipe changes', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    await setSelected(app, recipe.id, true, 4);

    assert.deepEqual(await amountsByIngredient(app), { Onion: [{ quantity: 8, unit: '' }] });
  });

  it('is back to one Recipe\'s worth when a Recipe is deselected and selected again', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(
      app,
      {
        name: 'Minestrone',
        type: 'Soup',
        ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
      },
      5,
    );

    await setSelected(app, recipe.id, false);
    await setSelected(app, recipe.id, true);

    assert.deepEqual(await amountsByIngredient(app), { Onion: [{ quantity: 2, unit: '' }] });
  });
});
