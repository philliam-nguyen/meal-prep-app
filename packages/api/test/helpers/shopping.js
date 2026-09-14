// Arranging what a cook does while walking the aisles, through the endpoints the app calls.
//
// Ingredient ids come off the Shopping List rather than from a lookup, because that is where these
// marks are made: the cook is reading the entry when they tick it.

import assert from 'node:assert/strict';

/** Marks a Shopping List entry Got It, or unmarks it, failing the test if the API refused. */
export async function setGotIt(app, ingredientId, gotIt) {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/ingredients/${ingredientId}/got-it`,
    payload: { gotIt },
  });
  assert.equal(response.statusCode, 204, response.body);
}

/** Sets the Aisle an Ingredient is found in, or clears it by passing null. */
export async function setAisle(app, ingredientId, aisle) {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/ingredients/${ingredientId}/aisle`,
    payload: { aisle },
  });
  assert.equal(response.statusCode, 204, response.body);
}

/** The one action that clears every Got It mark. */
export async function clearGotItMarks(app) {
  const response = await app.inject({ method: 'DELETE', url: '/api/shopping-list/got-it' });
  assert.equal(response.statusCode, 204, response.body);
}

/**
 * Done Shopping: the end of a trip, which deselects every Recipe and clears every Got It mark in
 * one request. One call rather than two, so a dropped response cannot leave the trip half over.
 */
export async function doneShopping(app) {
  const response = await app.inject({ method: 'DELETE', url: '/api/shopping-list' });
  assert.equal(response.statusCode, 204, response.body);
}

/** Whether each entry is ticked, keyed by Ingredient name, as a cook reads the list. */
export function gotItByIngredient(shoppingList) {
  return Object.fromEntries(shoppingList.map((entry) => [entry.name, entry.gotIt]));
}
