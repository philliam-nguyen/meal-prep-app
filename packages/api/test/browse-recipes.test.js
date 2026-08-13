// Browsing Recipes: one request returns everything the first paint needs.
//
// Search and Recipe Type filtering are not tested here because the API does not perform them. The
// whole collection arrives in this one response and the client narrows it, which is what makes a
// keystroke in the search box cost nothing.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { connect } from './helpers/database.js';
import { loadIngredient, loadRecipe } from './helpers/rows.js';

const getState = async (app) => {
  const response = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(response.statusCode, 200);
  return response.json();
};

describe('browsing Recipes', () => {
  it('returns an empty collection when nothing has been loaded', async (t) => {
    const app = await startApp(t);

    const state = await getState(app);

    assert.deepEqual(state.recipes, []);
  });

  it('returns a Recipe with its name, Recipe Type and Recipe Card', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      card_url: 'https://example.com/leek-and-potato',
    });

    const [recipe] = (await getState(app)).recipes;

    assert.equal(recipe.name, 'Leek and Potato Soup');
    assert.equal(recipe.type, 'Soup');
    assert.equal(recipe.cardUrl, 'https://example.com/leek-and-potato');
  });

  it('carries the spreadsheet id convention forward', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, { name: 'Leek and Potato Soup', type: 'Soup' });

    const [recipe] = (await getState(app)).recipes;

    assert.match(recipe.id, /^R\d{3,}$/);
  });

  it('reports whether a Recipe is a Selected Recipe', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, { name: 'Chosen', type: 'Dinner', selected: true });
    await loadRecipe(client, { name: 'Not chosen', type: 'Dinner' });

    const selectedByName = Object.fromEntries(
      (await getState(app)).recipes.map((recipe) => [recipe.name, recipe.selected]),
    );

    assert.deepEqual(selectedByName, { Chosen: true, 'Not chosen': false });
  });

  it('reports a Recipe with no Recipe Card as having none', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, { name: 'Nan bread', type: 'Bread' });

    const [recipe] = (await getState(app)).recipes;

    assert.equal(recipe.cardUrl, null);
  });

  it('returns each Recipe Ingredient with its quantity and unit', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: 500, unit: 'g' },
        { name: 'Stock', quantity: 1.5, unit: 'litres' },
      ],
    });

    const [recipe] = (await getState(app)).recipes;

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
    const client = await connect(t);
    await loadRecipe(client, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Black pepper', quantity: null, unit: '' }],
    });

    const [{ ingredients }] = (await getState(app)).recipes;

    assert.equal(ingredients[0].quantity, null);
    assert.notEqual(ingredients[0].quantity, 0);
  });

  it('returns a Recipe with no Recipe Ingredients as having none', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, { name: 'Toast', type: 'Breakfast' });

    const [recipe] = (await getState(app)).recipes;

    assert.deepEqual(recipe.ingredients, []);
  });

  it('points two Recipes calling for one food at the same Ingredient', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Butter', quantity: 30, unit: 'g' }],
    });
    await loadRecipe(client, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: 'Butter', quantity: 250, unit: 'g' }],
    });

    const [soup, shortbread] = (await getState(app)).recipes;

    assert.equal(soup.ingredients[0].ingredientId, shortbread.ingredients[0].ingredientId);
    assert.notEqual(soup.ingredients[0].quantity, shortbread.ingredients[0].quantity);
  });

  it('treats two spellings of one food as one Ingredient', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Butter', quantity: 30, unit: 'g' }],
    });
    await loadRecipe(client, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: '  butter ', quantity: 250, unit: 'g' }],
    });

    const [soup, shortbread] = (await getState(app)).recipes;

    assert.equal(soup.ingredients[0].ingredientId, shortbread.ingredients[0].ingredientId);
  });

  it('reports whether a Recipe is Protected', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, { name: 'Seeded', type: 'Dinner', protected: true });

    const [recipe] = (await getState(app)).recipes;

    assert.equal(recipe.protected, true);
  });

  it('orders Recipes by name so a browse list reads alphabetically', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    for (const name of ['Zucchini fritters', 'Apple crumble', 'Minestrone']) {
      await loadRecipe(client, { name, type: 'Dinner' });
    }

    const first = (await getState(app)).recipes.map((recipe) => recipe.name);
    const second = (await getState(app)).recipes.map((recipe) => recipe.name);

    assert.deepEqual(first, ['Apple crumble', 'Minestrone', 'Zucchini fritters']);
    assert.deepEqual(second, first);
  });

  it('serves one Ingredient shared across Recipes from a single row', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    const butter = await loadIngredient(client, { name: 'Butter', aisle: 'Dairy', staple: true });
    await loadRecipe(client, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: 'butter', quantity: 250, unit: 'g' }],
    });

    const [recipe] = (await getState(app)).recipes;

    assert.equal(recipe.ingredients[0].ingredientId, butter);
    assert.equal(recipe.ingredients[0].name, 'Butter');
  });
  it('answers the whole first paint from a single request', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    await loadRecipe(client, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      card_url: 'https://example.com/leek-and-potato',
      selected: true,
      ingredients: [{ name: 'Leek', quantity: 3, unit: '' }],
    });

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
