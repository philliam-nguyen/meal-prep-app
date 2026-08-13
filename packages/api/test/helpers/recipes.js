// Arranging Recipes the way ADR-0005 asks for: through the API, so a test cannot set up state the
// application itself could not produce.

import assert from 'node:assert/strict';

/** Creates a Recipe and returns it, failing the test if the API refused it. */
export async function createRecipe(app, body) {
  const response = await app.inject({ method: 'POST', url: '/api/recipes', payload: body });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

/** Every Recipe as the browse list sees it. */
export async function readRecipes(app) {
  const response = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(response.statusCode, 200);
  return response.json().recipes;
}
