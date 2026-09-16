// Filing a Shopping List entry into an Aisle from its picker, and watching it move under that
// heading before the write returns.
//
// `.instance.spec.js`, so it runs alone at the end (see `playwright.config.js`), the same reason
// shopping-list-done.instance.spec.js does. Every other Aisle test names its own Recipe or
// Ingredient and reads only what it put there, but an Aisle is visible instance-wide the moment it
// is created, and settings-aisles.desktop.spec.js reads the whole walk on screen and asserts it
// exactly. An Aisle created here while that suite is mid-assertion would show up as an extra row it
// never expected, so this waits for both parallel projects to finish rather than risk the race.

import { expect, test } from '@playwright/test';
import { API_ORIGIN } from '../../playwright.config.js';
import { createRecipeWith, setSelected, uniqueName } from './helpers/recipes.js';

/** Adds an Aisle through the endpoint the Settings page calls, failing the test if it was refused. */
async function createAisle(request, name) {
  const response = await request.post(`${API_ORIGIN}/api/aisles`, { data: { name } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

/** The named Ingredient's row in the grouped list. */
function shoppingRow(page, ingredientName) {
  return page.locator('.shopping-item').filter({ hasText: ingredientName });
}

test('filing an entry into an Aisle from the picker moves it under that heading', async ({ page, request }) => {
  const aisle = await createAisle(request, uniqueName('Produce'));
  const ingredientName = uniqueName('Leek');
  const recipe = await createRecipeWith(request, [{ name: ingredientName, quantity: 1, unit: 'g' }]);
  await setSelected(request, recipe.id, true);

  await page.goto('/');
  await page.getByRole('button', { name: 'Shopping', exact: true }).click();
  await expect(shoppingRow(page, ingredientName)).toBeVisible();

  await page.getByLabel(`Aisle for ${ingredientName}`).selectOption({ label: aisle.name });

  // Moved before the write returns - the optimistic update Got It already does, applied to the
  // group an entry sits in rather than to a single field on it.
  await expect(page.getByRole('group', { name: aisle.name }).getByText(ingredientName, { exact: true })).toBeVisible();
});
