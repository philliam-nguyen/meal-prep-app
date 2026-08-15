// Browsing Recipes: one request returns everything the first paint needs.
//
// Search and Recipe Type filtering are not tested here because the API does not perform them. The
// whole collection arrives in this one response and the client narrows it, which is what makes a
// keystroke in the search box cost nothing.
//
// Every piece of state here is arranged through the API, so no test sets up a Recipe the
// application itself could not produce.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { createRecipe, readRecipes, setSelected } from './helpers/recipes.js';

describe('browsing Recipes', () => {
  it('returns an empty collection when nothing has been added', async (t) => {
    const app = await startApp(t);

    assert.deepEqual(await readRecipes(app), []);
  });

  it('returns a Recipe with its name, Recipe Type and Recipe Card', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      cardUrl: 'https://example.com/leek-and-potato',
    });

    const [recipe] = await readRecipes(app);

    assert.equal(recipe.name, 'Leek and Potato Soup');
    assert.equal(recipe.type, 'Soup');
    assert.equal(recipe.cardUrl, 'https://example.com/leek-and-potato');
  });

  it('carries the spreadsheet id convention forward', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, { name: 'Leek and Potato Soup', type: 'Soup' });

    const [recipe] = await readRecipes(app);

    assert.match(recipe.id, /^R\d{3,}$/);
  });

  it('reports whether a Recipe is a Selected Recipe', async (t) => {
    const app = await startApp(t);
    const chosen = await createRecipe(app, { name: 'Chosen', type: 'Dinner' });
    await createRecipe(app, { name: 'Not chosen', type: 'Dinner' });
    await setSelected(app, chosen.id, true);

    const selectedByName = Object.fromEntries(
      (await readRecipes(app)).map((recipe) => [recipe.name, recipe.selected]),
    );

    assert.deepEqual(selectedByName, { Chosen: true, 'Not chosen': false });
  });

  it('reports a Recipe with no Recipe Card as having none', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, { name: 'Nan bread', type: 'Bread' });

    const [recipe] = await readRecipes(app);

    assert.equal(recipe.cardUrl, null);
  });

  it('returns each Recipe Ingredient with its quantity and unit', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: 500, unit: 'g' },
        { name: 'Stock', quantity: 1.5, unit: 'litres' },
      ],
    });

    const [recipe] = await readRecipes(app);

    assert.deepEqual(
      recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
      [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: 500, unit: 'g' },
        { name: 'Stock', quantity: 1.5, unit: 'litres' },
      ],
    );
  });

  it('reports an unquantified Recipe Ingredient as unquantified rather than as zero', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Black pepper', quantity: null, unit: '' }],
    });

    const [{ ingredients }] = await readRecipes(app);

    assert.equal(ingredients[0].quantity, null);
    assert.notEqual(ingredients[0].quantity, 0);
  });

  it('returns a Recipe with no Recipe Ingredients as having none', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, { name: 'Toast', type: 'Breakfast' });

    const [recipe] = await readRecipes(app);

    assert.deepEqual(recipe.ingredients, []);
  });

  // The flag as a cook meets it: unset, because nothing they can do sets it. The other side of it,
  // a seeded Recipe reporting itself Protected, belongs to the Seed and lives in seed.test.js.
  it('reports a Recipe a cook added as not Protected', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, { name: 'Mine', type: 'Dinner' });

    const [recipe] = await readRecipes(app);

    assert.equal(recipe.protected, false);
  });

  it('orders Recipes by name so a browse list reads alphabetically', async (t) => {
    const app = await startApp(t);
    for (const name of ['Zucchini fritters', 'Apple crumble', 'Minestrone']) {
      await createRecipe(app, { name, type: 'Dinner' });
    }

    const first = (await readRecipes(app)).map((recipe) => recipe.name);
    const second = (await readRecipes(app)).map((recipe) => recipe.name);

    assert.deepEqual(first, ['Apple crumble', 'Minestrone', 'Zucchini fritters']);
    assert.deepEqual(second, first);
  });

  it('answers the whole first paint from a single request', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      cardUrl: 'https://example.com/leek-and-potato',
      ingredients: [{ name: 'Leek', quantity: 3, unit: '' }],
    });
    await setSelected(app, created.id, true);

    const response = await app.inject({ method: 'GET', url: '/api/state' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().recipes[0], {
      id: 'R001',
      name: 'Leek and Potato Soup',
      type: 'Soup',
      cardUrl: 'https://example.com/leek-and-potato',
      selected: true,
      protected: false,
      ingredients: [{ ingredientId: 'I001', name: 'Leek', quantity: 3, unit: '' }],
    });
  });
});
