// The Batch stepper on the Recipe sheet, and the one thing it is for: a cook making a Recipe twice
// gets twice the shopping. Both projects, because the stepper is a control on a surface a phone and
// a desktop both open, and the number it sends is the same number either way.
//
// The assertion is on the Shopping List page rather than on the request the sheet sent, because
// what the ticket promises is that the list doubles. Everything in between - the stepper's value,
// the write, the reload, the derivation in SQL - is only how that happens.

import { expect, test } from '@playwright/test';
import { API_ORIGIN } from '../../playwright.config.js';
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
  // The stepper only writes once the Recipe reads as on the list, so that is waited for first: a
  // response the dev proxy dropped under load leaves the app resyncing for a round trip, and a
  // step sent inside that window would be a draft, not a write.
  await openRecipe(page, recipe.name);
  await expect(sheet(page, recipe.name).getByRole('button', { name: 'Remove from Shopping List' })).toBeVisible();
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

// The phantom write: the server applies the Batch, the response dies on the way back, and the
// client's revert leaves it believing the old truth. What the cook must see is the server's answer,
// not the revert's guess, and sooner than the next poll - in the window before the poll a stepper
// tap on a "deselected" Recipe is a draft, and a draft dies with the sheet.
//
// The poll is pinned to the pre-write version for the whole test, so a pass here is the failure
// path resyncing on its own, not the poll arriving in time to hide that it didn't.
test('a Batch write whose response is lost converges on what the server saved', async ({
  page,
  request,
}) => {
  const ingredient = uniqueName('Leek');
  const recipe = await createRecipe(request, {
    name: uniqueName('Leek and Potato Soup'),
    type: 'Soup',
    ingredients: [{ name: ingredient, quantity: 3, unit: 'g' }],
  });
  await openRecipe(page, recipe.name);
  await page.getByRole('button', { name: 'Add to Shopping List' }).click();
  await expect(page.getByText(`Added ${recipe.name}`)).toBeVisible();

  // Freeze the poll's view of the world before breaking anything.
  const { version } = await (await request.get(`${API_ORIGIN}/api/state`)).json();
  await page.route('**/api/version', route =>
    route.fulfill({ json: { version } }),
  );

  // The next Batch write reaches the API but its response never reaches the browser.
  await page.route('**/api/recipes/*/selected', async route => {
    const target = new URL(route.request().url());
    await request.put(`${API_ORIGIN}${target.pathname}`, {
      data: route.request().postDataJSON(),
    });
    await route.abort('connectionreset');
  }, { times: 1 });

  await openRecipe(page, recipe.name);
  const count = sheet(page, recipe.name).getByRole('status');
  await expect(count).toHaveText('1×');
  await page.getByRole('button', { name: 'Make one more batch' }).click();

  // The failure is loud, and then the resync tells the truth: the Batch the server saved.
  const complaint = page.getByText(`Could not change how many times you are making ${recipe.name}. Nothing was saved.`);
  await expect(complaint).toBeVisible();
  await expect(count).toHaveText('2×');

  // On a phone the toast sits over the search field expectSheetClosed proves is reachable, so the
  // toast has to go before the sheet does.
  await expect(complaint).toBeHidden({ timeout: 10_000 });
  await page.mouse.click(20, 20);
  await expectSheetClosed(page, recipe.name);
  await shoppingTab(page).click();
  await expect(shoppingRow(page, ingredient)).toContainText('6 g');
});
