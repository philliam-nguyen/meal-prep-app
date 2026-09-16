// The two views over the Pantry checklist, driven the way a cook would: switch to the view holding
// an Ingredient, tap it, and read what both views say afterwards. Nothing here inspects how the
// client split or filtered the list - that is `pantryViews.test.js`'s job - only what the page shows.
//
// Counts are asserted as "changed" rather than pinned to an exact number: the throwaway database is
// shared by every worker this run, all creating their own Ingredients concurrently, so the totals
// this page shows can move for reasons that have nothing to do with the tap this test is making.

import { expect, test } from '@playwright/test';
import { createRecipeWith, uniqueName } from './helpers/recipes.js';

test('tapping an ingredient in Not in Pantry moves it to In Pantry and updates both counts', async ({ page, request }) => {
  const ingredientName = uniqueName('quinoa');
  await createRecipeWith(request, [{ name: ingredientName, quantity: 1, unit: 'cup' }]);

  await page.goto('/');
  await page.getByRole('button', { name: 'Pantry' }).click();

  const notInPill = page.getByRole('button', { name: /^Not in Pantry/ });
  const inPill = page.getByRole('button', { name: /^In Pantry/ });
  await notInPill.click();

  const row = page.getByRole('button', { name: `I have ${ingredientName}` });
  await expect(row).toBeVisible();

  const notInBefore = await notInPill.textContent();
  const inBefore = await inPill.textContent();

  await row.click();

  // Gone from the view it left, and both pills' counts moved - the optimistic update the checklist
  // already does, run through the split rather than a round trip to the API.
  await expect(row).toHaveCount(0);
  await expect(notInPill).not.toHaveText(notInBefore);
  await expect(inPill).not.toHaveText(inBefore);

  await inPill.click();
  await expect(page.getByRole('button', { name: `Remove ${ingredientName} from your pantry` })).toBeVisible();
});

test('typing in the search narrows both views; clearing restores them', async ({ page, request }) => {
  const ingredientName = uniqueName('chickpea');
  await createRecipeWith(request, [{ name: ingredientName, quantity: 1, unit: 'cup' }]);

  await page.goto('/');
  await page.getByRole('button', { name: 'Pantry' }).click();

  const notInPill = page.getByRole('button', { name: /^Not in Pantry/ });
  const inPill = page.getByRole('button', { name: /^In Pantry/ });
  await notInPill.click();

  const row = page.getByRole('button', { name: `I have ${ingredientName}` });
  await expect(row).toBeVisible();
  const notInBefore = await notInPill.textContent();

  // A name only this test's Ingredient can carry, so filtering by it leaves exactly one match on
  // one side and none on the other, whatever else the shared database holds.
  await page.getByPlaceholder('Search ingredients...').fill(ingredientName);

  await expect(row).toBeVisible();
  await expect(notInPill).toHaveText('Not in Pantry (1)');
  await expect(inPill).toHaveText('In Pantry (0)');

  await page.getByRole('button', { name: 'Clear search' }).click();

  await expect(notInPill).toHaveText(notInBefore);
});
