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
import { createRecipe, createRecipeWith, fewIngredients, manyIngredients, manySteps, uniqueName } from './helpers/recipes.js';
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
  const firstIngredient = page.getByText('Ingredient 01');
  const lastIngredient = page.getByText('Ingredient 40');
  await expect(lastIngredient).not.toBeInViewport();

  // Scroll the list down inside the sheet.
  await lastIngredient.scrollIntoViewIfNeeded();
  await expect(lastIngredient).toBeInViewport();
  await expect(firstIngredient).not.toBeInViewport();
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
  const firstIngredient = page.getByText('Ingredient 01');
  await page.getByText('Ingredient 40').scrollIntoViewIfNeeded();
  await expect(firstIngredient).not.toBeInViewport();

  // Back to the top, then the pull.
  await firstIngredient.scrollIntoViewIfNeeded();
  await expect(firstIngredient).toBeInViewport();
  await dragDown(sheet(page, recipe.name), box.height * 0.8);

  await expectSheetClosed(page, recipe.name);
});

// The Instructions section ticket 05 added is more content in the same one scroll region, and the
// case the ticket named to watch: a Recipe long enough that the bottom of the sheet is well past
// where the Ingredients used to be the last thing in it.
test('a pull while Instructions are scrolled down scrolls the sheet content and leaves the sheet where it is', async ({
  page,
  request,
}) => {
  const recipe = await createRecipe(request, {
    name: uniqueName('Leek and Potato Soup'),
    type: 'Soup',
    ingredients: fewIngredients,
    steps: manySteps,
  });
  await openRecipe(page, recipe.name);
  const box = await sheet(page, recipe.name).boundingBox();
  const lastStep = page.getByText(manySteps[manySteps.length - 1]);
  await expect(lastStep).not.toBeInViewport();

  // Scroll Instructions down inside the sheet.
  await lastStep.scrollIntoViewIfNeeded();
  await expect(lastStep).toBeInViewport();
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

test('once the sheet is scrolled back to the top past Instructions, a further pull closes it', async ({
  page,
  request,
}) => {
  const recipe = await createRecipe(request, {
    name: uniqueName('Leek and Potato Soup'),
    type: 'Soup',
    ingredients: fewIngredients,
    steps: manySteps,
  });
  await openRecipe(page, recipe.name);
  const box = await sheet(page, recipe.name).boundingBox();
  // The top of the whole sheet, above both sections - the anchor a pull-up all the way lands on,
  // Instructions included.
  const firstIngredient = page.getByText(fewIngredients[0].name, { exact: true });
  await page.getByText(manySteps[manySteps.length - 1]).scrollIntoViewIfNeeded();
  await expect(firstIngredient).not.toBeInViewport();

  // Back to the top, then the pull.
  await firstIngredient.scrollIntoViewIfNeeded();
  await expect(firstIngredient).toBeInViewport();
  await dragDown(sheet(page, recipe.name), box.height * 0.8);

  await expectSheetClosed(page, recipe.name);
});
