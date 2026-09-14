// The Batch stepper on the Recipe sheet, and the one thing it is for: a cook making a Recipe twice
// gets twice the shopping. Both projects, because the stepper is a control on a surface a phone and
// a desktop both open, and the number it sends is the same number either way.
//
// The assertion is on the Shopping List page rather than on the request the sheet sent, because
// what the ticket promises is that the list doubles. Everything in between - the stepper's value,
// the write, the reload, the derivation in SQL - is only how that happens.

import { expect, test } from '@playwright/test';
import { createRecipe, uniqueName } from './helpers/recipes.js';
import { expectSheetClosed, openRecipe, sheet } from './helpers/sheet.js';

/**
 * The Shopping List as this test can read it. The database is shared by every test in the run and
 * never truncated, so this test's Ingredient is named for this run alone and the row is found by
 * that name: another test's Selected Recipe must not be able to add to the amount asserted here.
 */
function shoppingRow(page, ingredient) {
  return page.locator('.shopping-item').filter({ hasText: ingredient });
}

/**
 * Goes to the Shopping List the way a cook does. Exact, because the sheet's own button is called
 * "Remove from Shopping List" and a loose name matches both.
 */
function shoppingTab(page) {
  return page.getByRole('button', { name: 'Shopping', exact: true });
}

test('a Batch of two doubles what the Shopping List says to buy', async ({ page, request }) => {
  const ingredient = uniqueName('Leek');
  const recipe = await createRecipe(request, {
    name: uniqueName('Leek and Potato Soup'),
    type: 'Soup',
    ingredients: [{ name: ingredient, quantity: 3, unit: 'g' }],
  });
  await openRecipe(page, recipe.name);
  const count = sheet(page, recipe.name).getByRole('status');
  await expect(count).toHaveText('1×');

  await page.getByRole('button', { name: 'Make one more batch' }).click();
  await expect(count).toHaveText('2×');
  await page.getByRole('button', { name: 'Add to Shopping List' }).click();

  await shoppingTab(page).click();
  // Six, not three: the amount is multiplied by the Batch before it is summed, on the server.
  await expect(shoppingRow(page, ingredient)).toContainText('6 g');
});

test('the stepper stops at 1 and at 9 rather than sending a Batch the API refuses', async ({
  page,
  request,
}) => {
  const recipe = await createRecipe(request, {
    name: uniqueName('Leek and Potato Soup'),
    type: 'Soup',
    ingredients: [{ name: uniqueName('Leek'), quantity: 3, unit: 'g' }],
  });
  await openRecipe(page, recipe.name);
  const count = sheet(page, recipe.name).getByRole('status');
  const fewer = page.getByRole('button', { name: 'Make one fewer batch' });
  const more = page.getByRole('button', { name: 'Make one more batch' });

  await expect(fewer).toBeDisabled();

  for (let step = 0; step < 8; step += 1) await more.click();

  await expect(count).toHaveText('9×');
  await expect(more).toBeDisabled();
});

test('a Batch set on a Recipe already on the list changes the list', async ({ page, request }) => {
  const ingredient = uniqueName('Leek');
  const recipe = await createRecipe(request, {
    name: uniqueName('Leek and Potato Soup'),
    type: 'Soup',
    ingredients: [{ name: ingredient, quantity: 3, unit: 'g' }],
  });
  await openRecipe(page, recipe.name);
  await page.getByRole('button', { name: 'Add to Shopping List' }).click();

  // Opened again, the sheet shows the Batch the Recipe is stored with rather than starting over.
  await openRecipe(page, recipe.name);
  await expect(sheet(page, recipe.name).getByRole('status')).toHaveText('1×');
  await page.getByRole('button', { name: 'Make one more batch' }).click();
  await expect(sheet(page, recipe.name).getByRole('status')).toHaveText('2×');

  // The sheet stays open on a Batch change, unlike Add, so it is dismissed the way a person does
  // it: a tap on the dim outside. The nav bar is behind the sheet until it goes.
  await page.mouse.click(20, 20);
  await expectSheetClosed(page, recipe.name);
  await shoppingTab(page).click();
  await expect(shoppingRow(page, ingredient)).toContainText('6 g');
});
