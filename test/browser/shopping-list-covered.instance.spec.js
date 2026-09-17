// Covered: a Shopping List entry whose Ingredient is already in the Pantry. Derived by the API on
// every read (covered.test.js pins the derivation down), so this only asks what the page shows once
// that arrives - a distinct marker, and a remaining count that has stopped counting it.
//
// `.instance.spec.js`, for the reason shopping-list-done.instance.spec.js gives: the remaining count
// is a fact about the whole Shopping List, not about one Recipe's Ingredients, so a Selected Recipe
// another test leaves standing changes the number this page shows. Rather than pin an absolute
// count, this reads the same total the page derives from - /api/state, right after its own setup -
// and asks the page to agree with it, which holds regardless of what else is on the list.

import { expect, test } from '@playwright/test';
import { API_ORIGIN } from '../../playwright.config.js';
import { createRecipeWith, setSelected, uniqueName } from './helpers/recipes.js';

/** Puts an Ingredient in the Pantry, through the endpoint the Pantry page calls. */
async function setPantry(request, ingredientId, inPantry) {
  const response = await request.put(`${API_ORIGIN}/api/ingredients/${ingredientId}/pantry`, {
    data: { inPantry },
  });
  expect(response.status(), await response.text()).toBe(204);
}

/** The whole first-paint payload, read the way the page itself does. */
async function readState(request) {
  const response = await request.get(`${API_ORIGIN}/api/state`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

/** What the page's own remaining-count line says, from the same rule it applies. */
function remainingLineFor(state) {
  const remaining = state.shoppingList.filter((entry) => !entry.gotIt && !entry.covered).length;
  return `${remaining} ingredient${remaining !== 1 ? 's' : ''} left to buy`;
}

/** Opens the app on the Shopping List page, the way a cook reaches it: the tab at the bottom. */
async function openShoppingList(page) {
  await page.goto('/');
  // Exact, because the page this opens has a Done Shopping button on it and the default match is a
  // substring.
  await page.getByRole('button', { name: 'Shopping', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Shopping List' })).toBeVisible();
}

/** The named Ingredient's row in the grouped list. */
function shoppingRow(page, ingredientName) {
  return page.locator('.shopping-item').filter({ hasText: ingredientName });
}

test('a Covered entry shows distinctly and the remaining count excludes it', async ({ page, request }) => {
  const coveredName = uniqueName('Chickpeas');
  const uncoveredName = uniqueName('Cumin');
  const recipe = await createRecipeWith(request, [
    { name: coveredName, quantity: 1, unit: 'tin' },
    { name: uncoveredName, quantity: 1, unit: 'tsp' },
  ]);
  const covered = recipe.ingredients.find((ingredient) => ingredient.name === coveredName);
  await setPantry(request, covered.ingredientId, true);
  await setSelected(request, recipe.id, true);

  const state = await readState(request);
  await openShoppingList(page);

  const coveredRow = shoppingRow(page, coveredName);
  const uncoveredRow = shoppingRow(page, uncoveredName);
  await expect(coveredRow).toBeVisible();
  await expect(uncoveredRow).toBeVisible();

  // The marker is on the Covered row alone, and the row it sits on carries the class the muted
  // style hangs off - the same shape the Got It class already has, kept distinct from it.
  await expect(coveredRow.getByText('Covered', { exact: true })).toBeVisible();
  await expect(uncoveredRow.getByText('Covered', { exact: true })).toHaveCount(0);
  await expect(coveredRow).toHaveClass(/covered/);
  await expect(coveredRow).not.toHaveClass(/got-it/);

  // Covered is excluded from what is left to buy the same way Got It is, whatever else is on the
  // shared list right now.
  await expect(page.getByText(/ ingredients? left to buy/)).toHaveText(remainingLineFor(state));

  // The Got It control still works on a Covered entry - buying more of something on hand is not
  // forbidden.
  await coveredRow.getByRole('button', { name: `Mark ${coveredName} as got it` }).click();
  await expect(coveredRow).toHaveClass(/got-it/);
});
