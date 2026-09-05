// On a desktop the sheet closes on a click outside it, and nothing about that changes with the
// swipe gesture the mobile project tests. Desktop only, by the file's name.

import { test } from '@playwright/test';
import { createRecipeWith, fewIngredients } from './helpers/recipes.js';
import { expectSheetClosed, openRecipe } from './helpers/sheet.js';

test('clicking the dimmed area outside the sheet closes it', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, fewIngredients);
  await openRecipe(page, recipe.name);

  // The top-left corner of the window: the sheet sits at the bottom, centred, so this is the dim.
  await page.mouse.click(20, 20);

  await expectSheetClosed(page, recipe.name);
});
