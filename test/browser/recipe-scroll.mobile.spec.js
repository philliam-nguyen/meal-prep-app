// A long Recipe scrolls inside the sheet, and the pull-to-close takes over only once the list is
// at the top. Mobile only, by the file's name.
//
// A synthetic touch cannot scroll content natively, and mobile WebKit has no wheel, so the list is
// scrolled by bringing a row into view, which scrolls the sheet's own content the way a finger
// would end up leaving it. What is asserted about the pull while scrolled is what a person would
// see, that the sheet did not move, plus the one thing they could not: that the touch was left to
// the browser, read as defaultPrevented on the way past. That flag is the whole contract between
// the gesture and native scrolling, and the only way a synthetic finger can observe it.

import { expect, test } from '@playwright/test';
import { createRecipeWith, manyIngredients } from './helpers/recipes.js';
import { dragDown, expectSheetClosed, openRecipe, sheet, sheetTitle, sheetTop } from './helpers/sheet.js';

/** Records, on the page, whether each touchmove reached the document still cancelable. */
async function watchTouchMoves(page) {
  await page.evaluate(() => {
    window.__touchMoves = [];
    document.addEventListener('touchmove', (e) => window.__touchMoves.push(e.defaultPrevented));
  });
  return {
    /** True when every touchmove so far was left to the browser. */
    allLeftToBrowser: () => page.evaluate(() => window.__touchMoves.every((p) => !p)),
    count: () => page.evaluate(() => window.__touchMoves.length),
  };
}

test('a pull while the list is scrolled down scrolls the list and leaves the sheet where it is', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, manyIngredients);
  await openRecipe(page, recipe.name);
  const box = await sheet(page, recipe.name).boundingBox();
  const firstRow = page.getByText('Ingredient 01');
  const lastRow = page.getByText('Ingredient 40');
  await expect(lastRow).not.toBeInViewport();

  // Scroll the list down inside the sheet.
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow).toBeInViewport();
  await expect(firstRow).not.toBeInViewport();
  const moves = await watchTouchMoves(page);

  await dragDown(sheet(page, recipe.name), box.height * 0.8, {
    whileHeld: async () => {
      expect(await sheetTop(page, recipe.name)).toBeCloseTo(box.y, 0);
    },
  });

  await expect(sheetTitle(page, recipe.name)).toBeVisible();
  expect(await sheetTop(page, recipe.name)).toBeCloseTo(box.y, 0);
  expect(await moves.count()).toBeGreaterThan(0);
  expect(await moves.allLeftToBrowser()).toBe(true);
});

test('once the list is back at the top, a further pull closes the sheet', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, manyIngredients);
  await openRecipe(page, recipe.name);
  const box = await sheet(page, recipe.name).boundingBox();
  const firstRow = page.getByText('Ingredient 01');
  await page.getByText('Ingredient 40').scrollIntoViewIfNeeded();
  await expect(firstRow).not.toBeInViewport();

  // Back to the top, then the pull.
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow).toBeInViewport();
  await dragDown(sheet(page, recipe.name), box.height * 0.8);

  await expectSheetClosed(page, recipe.name);
});
