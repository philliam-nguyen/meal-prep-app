// On a phone the sheet closes when pulled down far enough, and snaps back when it is not. Mobile
// only, by the file's name: the iPhone WebKit project with touch enabled.

import { expect, test } from '@playwright/test';
import { createRecipeWith, fewIngredients, readRecipes } from './helpers/recipes.js';
import { dragDown, expectSheetClosed, openRecipe, sheet, sheetTitle, sheetTop } from './helpers/sheet.js';

test('dragging the sheet down most of its height closes it', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, fewIngredients);
  await openRecipe(page, recipe.name);
  const box = await sheet(page, recipe.name).boundingBox();

  await dragDown(sheet(page, recipe.name), box.height * 0.8);

  await expectSheetClosed(page, recipe.name);
});

test('a short drag snaps the sheet back, and the button under the finger still works', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, fewIngredients);
  await openRecipe(page, recipe.name);
  const box = await sheet(page, recipe.name).boundingBox();
  const addToList = page.getByRole('button', { name: 'Add to Shopping List' });
  const pull = box.height * 0.08;

  // The finger starts on the button, so a snap-back that leaked its release as a click would
  // select the Recipe on its own.
  await dragDown(addToList, pull, {
    // Held, the sheet has followed the finger: a person sees it sitting lower before letting go.
    whileHeld: async () => {
      expect(await sheetTop(page, recipe.name)).toBeGreaterThan(box.y + pull * 0.9);
    },
  });

  await expect(sheetTitle(page, recipe.name)).toBeVisible();
  await expect.poll(() => sheetTop(page, recipe.name)).toBeCloseTo(box.y, 0);
  expect((await readRecipes(request)).find((r) => r.id === recipe.id).selected).toBe(false);

  // A real tap, now, still works: the Recipe becomes a Selected Recipe and the card says so.
  await addToList.click();
  const card = page.getByRole('heading', { level: 3, name: recipe.name }).locator('..');
  await expect(card.getByText('In List')).toBeVisible();
  await expect
    .poll(async () => (await readRecipes(request)).find((r) => r.id === recipe.id).selected)
    .toBe(true);
});

test('pulling the sheet upward past its rest position moves nothing', async ({ page, request }) => {
  const recipe = await createRecipeWith(request, fewIngredients);
  await openRecipe(page, recipe.name);
  const box = await sheet(page, recipe.name).boundingBox();

  await dragDown(sheet(page, recipe.name), -box.height * 0.3, {
    whileHeld: async () => {
      expect(await sheetTop(page, recipe.name)).toBeCloseTo(box.y, 0);
    },
  });

  await expect(sheetTitle(page, recipe.name)).toBeVisible();
  expect(await sheetTop(page, recipe.name)).toBeCloseTo(box.y, 0);
});
