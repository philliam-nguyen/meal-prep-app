// Arranging the Pantry the way a cook does: through the endpoints the app calls.
//
// Ingredient ids come from the Recipe that created them rather than from a lookup, because a Staple
// is deliberately absent from the checklist and a test that unmarks one still needs its id.

import assert from 'node:assert/strict';

/** The whole first-paint payload. */
async function readState(app) {
  const response = await app.inject({ method: 'GET', url: '/api/state' });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

/** The Ingredients a cook is asked to tick. */
export async function readPantryChecklist(app) {
  return (await readState(app)).pantryChecklist;
}

/** The Ingredients assumed always on hand, which the checklist leaves out. */
export async function readStaples(app) {
  return (await readState(app)).staples;
}

/** Best Matches in rank order. */
export async function readBestMatches(app) {
  return (await readState(app)).bestMatches;
}

/** The id the API minted for one of a Recipe's Ingredients. */
export function ingredientIdIn(recipe, name) {
  const found = recipe.ingredients.find((ingredient) => ingredient.name === name);
  assert.ok(found, `${recipe.name} does not list ${name}`);
  return found.ingredientId;
}

/** Puts an Ingredient in the Pantry or takes it out, failing the test if the API refused. */
export async function setPantry(app, ingredientId, inPantry) {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/ingredients/${ingredientId}/pantry`,
    payload: { inPantry },
  });
  assert.equal(response.statusCode, 204, response.body);
}

/** Marks an Ingredient a Staple or stops it being one. */
export async function setStaple(app, ingredientId, staple) {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/ingredients/${ingredientId}/staple`,
    payload: { staple },
  });
  assert.equal(response.statusCode, 204, response.body);
}
