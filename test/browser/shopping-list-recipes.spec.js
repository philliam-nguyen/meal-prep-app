// The Selected Recipes area above the Shopping List: what a person sees and taps, in the shape the
// approved mock (ticket 04) settled on. The rules underneath - which group an Ingredient lands in,
// which half of a group it sinks to - are asserted without a browser in shoppingListViews.test.js
// and are not repeated here. The picker that files an entry into an Aisle has its own browser test,
// in shopping-list-aisle-filing.instance.spec.js, for the reason explained there.
//
// Both projects, and parallel: the throwaway database is shared by every worker in the run and
// never truncated, so each test names its own Recipe and Ingredient with `uniqueName` and reads
// only what it put there. Another test's Selected Recipe sharing the same page is exactly what the
// mock's capped, scrolling area is for.

import { expect, test } from '@playwright/test';
import { createRecipe, createRecipeWith, setSelected, uniqueName } from './helpers/recipes.js';
import { openRecipe } from './helpers/sheet.js';

/** Opens the app on the Shopping List page, the way a cook reaches it: the tab at the bottom. */
async function openShoppingList(page) {
  await page.goto('/');
  // Exact, because the page this opens has a Done Shopping button on it and the default match is a
  // substring.
  await page.getByRole('button', { name: 'Shopping', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Shopping List' })).toBeVisible();
}

/** The named Recipe's row in the Selected Recipes area. */
function selectedRecipeRow(page, recipeName) {
  return page.locator('.selected-recipe-row').filter({ hasText: recipeName });
}

/** The named Ingredient's row in the grouped list below. */
function shoppingRow(page, ingredientName) {
  return page.locator('.shopping-item').filter({ hasText: ingredientName });
}

test('the Shopping List shows the Selected Recipes; removing one removes its Ingredients and the list regroups', async ({
  page,
  request,
}) => {
  const ingredientName = uniqueName('Leek');
  const recipe = await createRecipeWith(request, [{ name: ingredientName, quantity: 1, unit: 'g' }]);
  await setSelected(request, recipe.id, true);

  await openShoppingList(page);

  const row = selectedRecipeRow(page, recipe.name);
  await expect(row).toBeVisible();
  // The Recipe Type badge sits in the same row as the name, not merely somewhere on the page -
  // createRecipeWith always makes a Soup, so this is what the row is asserted to say.
  await expect(row.getByText('Soup', { exact: true })).toBeVisible();
  await expect(shoppingRow(page, ingredientName)).toBeVisible();

  await row.getByRole('button', { name: `Remove ${recipe.name}` }).click();

  // Deselecting through the remove control is the write the Recipes page's own toggle makes, so the
  // row leaves the area and its Ingredient leaves the grouped list below without a page reload.
  await expect(row).toHaveCount(0);
  await expect(shoppingRow(page, ingredientName)).toHaveCount(0);
});

test('a Batch set on the sheet shows as a chip on the Selected Recipe row', async ({ page, request }) => {
  const recipe = await createRecipe(request, {
    name: uniqueName('Leek and Potato Soup'),
    type: 'Soup',
    ingredients: [{ name: uniqueName('Leek'), quantity: 3, unit: 'g' }],
  });
  await openRecipe(page, recipe.name);
  await page.getByRole('button', { name: 'Make one more batch' }).click();
  await page.getByRole('button', { name: 'Add to Shopping List' }).click();

  await openShoppingList(page);

  const row = selectedRecipeRow(page, recipe.name);
  await expect(row).toBeVisible();
  // 2x, not a 1x chip the mock decided to keep off the row: the slot between the Type badge and
  // the remove control only fills in once the Batch is above 1.
  await expect(row.getByText('2×', { exact: true })).toBeVisible();
});
