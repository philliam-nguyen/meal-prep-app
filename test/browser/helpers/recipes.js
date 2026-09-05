// Arranging Recipes the way ADR-0005 asks for: through the API, so a test cannot set up state the
// application itself could not produce. The browser suite's copy of the API suite's
// packages/api/test/helpers/recipes.js, with one difference that is the whole reason it exists:
// those helpers drive Fastify in-process through `inject`, and this suite's API is a separate
// process on a port, so these speak HTTP to it. Same names, same shape, same rule that a refusal
// fails the test loudly rather than leaving the page empty.
//
// Requests go straight to the throwaway API rather than through Vite's proxy. Setup is not the
// thing under test, and an arrangement that leaned on the dev server would fail a test about the
// sheet with an error about a proxy.

import { randomBytes } from 'node:crypto';
import { expect } from '@playwright/test';
import { API_ORIGIN } from '../../../playwright.config.js';

/**
 * A Recipe name no other test in this run can have used. The database is shared by every test in
 * a run and never truncated between them, since two workers truncating would take each other's
 * rows away, so tests find their own Recipe by a name that is theirs alone.
 */
export function uniqueName(base) {
  return `${base} ${randomBytes(3).toString('hex')}`;
}

/** Creates a Recipe and returns it, failing the test if the API refused it. */
export async function createRecipe(request, body) {
  const response = await request.post(`${API_ORIGIN}/api/recipes`, { data: body });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

/**
 * Creates a Recipe with the given Recipe Ingredients, named uniquely for this run, and returns it.
 * The one most tests here want: something to open in the sheet.
 */
export async function createRecipeWith(request, ingredients, { name = 'Leek and Potato Soup' } = {}) {
  return createRecipe(request, {
    name: uniqueName(name),
    type: 'Soup',
    cardUrl: 'https://example.com/leek-and-potato',
    ingredients,
  });
}

/** Every Recipe as the browse list sees it. */
export async function readRecipes(request) {
  return (await readState(request)).recipes;
}

/** The whole first-paint payload, for assertions that span more than one of its lists. */
export async function readState(request) {
  const response = await request.get(`${API_ORIGIN}/api/state`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

/** A handful of Recipe Ingredients, enough to read but not enough to overflow a sheet. */
export const fewIngredients = [
  { name: 'Leek', quantity: 3, unit: '' },
  { name: 'Potato', quantity: 500, unit: 'g' },
  { name: 'Butter', quantity: 50, unit: 'g' },
];
