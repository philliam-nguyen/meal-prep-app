// Done Shopping, from the Shopping List page: it asks once, and then the page is empty.
//
// `.instance.spec.js`, so it runs in the project that runs alone (see `playwright.config.js`).
// Done Shopping deselects every Recipe in the instance, and the empty page it leaves is only empty
// while nothing else is putting a Recipe on the list, so this is one of the few tests here that
// cannot share a database with another running at the same time.

import { expect, test } from '@playwright/test';
import { OFFLINE_NOTICE } from '../../packages/web/src/degraded.js';
import { createRecipeWith, fewIngredients, readRecipes, setSelected } from './helpers/recipes.js';

const EMPTY_LIST = 'Nothing to buy yet. Select a recipe and its ingredients land here.';

/** Opens the app on the Shopping List page, the way a cook reaches it: the tab at the bottom. */
async function openShoppingList(page) {
  await page.goto('/');
  // Exact, because the page this opens has a Done Shopping button on it and the default match is a
  // substring.
  await page.getByRole('button', { name: 'Shopping', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Shopping List' })).toBeVisible();
}

test('Done Shopping asks before it empties the list', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, fewIngredients);
  await setSelected(request, recipe.id, true);
  await openShoppingList(page);
  await expect(page.getByText('Leek', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Done Shopping' }).click();

  // Asked, and nothing done yet: the list a mis-tap in the car park would have wiped is still here.
  await expect(page.getByText('Clear the list and start fresh?')).toBeVisible();
  await expect(page.getByText('Leek', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: "Yes, I'm done" }).click();

  // The empty state the page has always shown when nothing is on the list.
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  await expect(page.getByText('Leek', { exact: true })).toHaveCount(0);
  // And the Recipe that fed it is no longer Selected, which is the half of Done Shopping the empty
  // page cannot tell apart from every mark being cleared.
  await expect
    .poll(async () => (await readRecipes(request)).find((r) => r.id === recipe.id).selected)
    .toBe(false);
});

test('Cancel leaves the trip alone', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, fewIngredients);
  await setSelected(request, recipe.id, true);
  await openShoppingList(page);

  await page.getByRole('button', { name: 'Done Shopping' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByText('Leek', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done Shopping' })).toBeVisible();
  expect((await readRecipes(request)).find((r) => r.id === recipe.id).selected).toBe(true);
});

// Degraded mode: the API cannot answer the first paint, so the page renders the recording the
// bundle ships and every control that writes is off (ADR-0009). Done Shopping is the one that would
// hurt most if it looked live: a cook would tap it, see nothing happen, and have no way to know
// whether their week had just been cleared.
test('Done Shopping is disabled while the backend is offline', async ({ page }) => {
  await page.route('**/api/state', (route) => route.abort());

  await openShoppingList(page);

  await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done Shopping' })).toBeDisabled();
});
