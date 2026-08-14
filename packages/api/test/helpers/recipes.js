// Arranging Recipes the way ADR-0005 asks for: through the API, so a test cannot set up state the
// application itself could not produce.

import assert from 'node:assert/strict';

/** Creates a Recipe and returns it, failing the test if the API refused it. */
export async function createRecipe(app, body) {
  const response = await app.inject({ method: 'POST', url: '/api/recipes', payload: body });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

/** Marks a Recipe as a Selected Recipe, or unmarks it. */
export async function setSelected(app, recipeId, selected) {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/recipes/${recipeId}/selected`,
    payload: { selected },
  });
  assert.equal(response.statusCode, 204, response.body);
}

/** Every Recipe as the browse list sees it. */
export async function readRecipes(app) {
  return (await readState(app)).recipes;
}

/** The Shopping List the Selected Recipes derive to. */
export async function readShoppingList(app) {
  return (await readState(app)).shoppingList;
}

async function readState(app) {
  const response = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(response.statusCode, 200);
  return response.json();
}
