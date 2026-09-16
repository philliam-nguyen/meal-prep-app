// The Aisles section on the Settings page: the store's sections in walk order, with the controls
// that add one, rename one, move one and remove one.
//
// A browser suite rather than an API one, because what is being asserted is what a person sees and
// taps: that the list is on the page in the order the API returned it, that each control is on the
// row it belongs to, and that degraded mode leaves every one of them dead. The rules underneath -
// duplicate names, the walk the reorder endpoint takes - are asserted over HTTP in
// packages/api/test/aisles.test.js and are not repeated here.
//
// Desktop only, and serial. The suite's database is shared by every test in a run and never
// truncated, and reordering is one request carrying the whole walk: two tests moving sections at
// once would each send a list the other had already changed. One project, one at a time, so the
// walk on screen is the walk this file put there.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { API_ORIGIN } from '../../playwright.config.js';
import { OFFLINE_NOTICE } from '../../packages/web/src/degraded.js';
import { createRecipeWith, uniqueName } from './helpers/recipes.js';

test.describe.configure({ mode: 'serial' });

const recordedSeedFile = fileURLToPath(
  new URL('../../packages/web/public/recorded-seed.json', import.meta.url),
);

/** Opens Settings on a page that has finished its first paint. */
async function openSettings(page) {
  await page.goto('/');
  await expect(page.getByPlaceholder('Search recipes...')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'AISLES' })).toBeVisible();
}

/** The Aisle names on screen, top to bottom, which is the order the cook walks them in. */
async function namesOnScreen(page) {
  return page.locator('[data-aisle-name]').allTextContents();
}

/** Removes every Aisle this run has left behind, so the next test starts from a walk it owns. */
async function clearTheWalk(request) {
  const state = await request.get(`${API_ORIGIN}/api/state`);
  expect(state.status(), await state.text()).toBe(200);
  for (const aisle of (await state.json()).aisles) {
    const removed = await request.delete(`${API_ORIGIN}/api/aisles/${aisle.id}`);
    expect(removed.status(), await removed.text()).toBe(204);
  }
}

test.beforeEach(async ({ request }) => clearTheWalk(request));
test.afterAll(async ({ request }) => clearTheWalk(request));

test('a cook sets up the walk through their store', async ({ page }) => {
  const produce = uniqueName('Produce');
  const bakery = uniqueName('Bakery');
  await openSettings(page);

  // Added, and each one lands at the end of the walk.
  await page.getByLabel('Add an aisle').fill(produce);
  await page.getByRole('button', { name: 'Add aisle' }).click();
  await expect(page.getByText(`Added ${produce}`)).toBeVisible();
  await page.getByLabel('Add an aisle').fill(bakery);
  await page.getByRole('button', { name: 'Add aisle' }).click();
  await expect(page.locator('[data-aisle-name]')).toHaveCount(2);
  expect(await namesOnScreen(page)).toEqual([produce, bakery]);

  // Moved, which is the whole walk going back to the API and coming out in the new order.
  await page.getByRole('button', { name: `Move ${produce} down` }).click();
  await expect(page.getByRole('button', { name: `Move ${produce} down` })).toBeDisabled();
  expect(await namesOnScreen(page)).toEqual([bakery, produce]);
  await page.getByRole('button', { name: `Move ${produce} up` }).click();
  await expect(page.getByRole('button', { name: `Move ${produce} up` })).toBeDisabled();
  expect(await namesOnScreen(page)).toEqual([produce, bakery]);

  // Renamed, and it stays where it was in the walk.
  const bread = uniqueName('Bread');
  await page.getByRole('button', { name: `Rename ${bakery}` }).click();
  await page.getByLabel(`New name for ${bakery}`).fill(bread);
  await page.getByLabel(`New name for ${bakery}`).press('Enter');
  await expect(page.getByText(bread)).toBeVisible();
  expect(await namesOnScreen(page)).toEqual([produce, bread]);

  // Removed, behind the one question the control asks first.
  await page.getByRole('button', { name: `Remove ${bread}` }).click();
  await expect(page.getByText(`Remove ${bread}?`)).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText(`Removed ${bread}`)).toBeVisible();
  expect(await namesOnScreen(page)).toEqual([produce]);
});

// The end of the walk is not somewhere a section can be sent onward from, and the API takes the
// whole list or nothing, so the two buttons that have nowhere to go are dead rather than sending a
// request that would be refused.
test('the ends of the walk have nowhere further to go', async ({ page }) => {
  const only = uniqueName('Produce');
  await openSettings(page);
  await page.getByLabel('Add an aisle').fill(only);
  await page.getByRole('button', { name: 'Add aisle' }).click();
  await expect(page.locator('[data-aisle-name]')).toHaveCount(1);

  await expect(page.getByRole('button', { name: `Move ${only} up` })).toBeDisabled();
  await expect(page.getByRole('button', { name: `Move ${only} down` })).toBeDisabled();
});

// The bulk view below the walk: every Ingredient the app knows, with the same picker the Shopping
// List uses. Sharing this file rather than a spec of its own, and its serial mode and clearTheWalk
// hooks along with it, is what keeps an Aisle this test relies on from being deleted mid-test by a
// concurrent run of this file's own hooks - a risk a separate spec file would carry, since the walk
// is instance-wide and this suite's database is never truncated between files. Search narrows to
// this test's own uniquely named Ingredient, so what the unassigned filter shows is never in doubt
// however many other Ingredients other browser tests have left unfiled.
test('a cook narrows the bulk view to unassigned and files one Ingredient', async ({ page, request }) => {
  const ingredientName = uniqueName('Fennel');
  await createRecipeWith(request, [{ name: ingredientName, quantity: 1, unit: '' }]);
  const produce = uniqueName('Produce');
  await openSettings(page);

  await page.getByLabel('Add an aisle').fill(produce);
  await page.getByRole('button', { name: 'Add aisle' }).click();
  await expect(page.getByText(`Added ${produce}`)).toBeVisible();

  await expect(page.getByRole('heading', { name: 'INGREDIENTS BY AISLE' })).toBeVisible();
  await page.getByPlaceholder('Search ingredients...').fill(ingredientName);
  await page.getByLabel('Unassigned only').check();

  const picker = page.getByLabel(`Aisle for ${ingredientName}`);
  await expect(picker).toBeVisible();

  // Filed through the picker, which is the one write this view makes and the same one the Shopping
  // List's own picker makes. The optimistic update lands before any request returns, so the row
  // leaves the unassigned filter it no longer matches without waiting on the network.
  await picker.selectOption({ label: produce });

  await expect(picker).toHaveCount(0);

  // Clearing the unassigned filter brings it back, now showing the Aisle that was just set.
  await page.getByLabel('Unassigned only').uncheck();
  await expect(page.getByLabel(`Aisle for ${ingredientName}`)).toHaveValue(/.+/);
});

// Degraded mode is reached the only way a visitor reaches it: the API cannot answer the first paint
// and the bundle's recording is what renders (ADR-0009). Nothing is mocked in the sense that ADR
// bans - the API is real and running - but this page is asked to render as though it were not, and
// the recording it falls back to is handed a walk so that every control has a row to sit on.
test('every Aisle control is dead while the backend is offline', async ({ page }) => {
  const recorded = JSON.parse(await readFile(recordedSeedFile, 'utf8'));
  const walk = [
    { id: 'A001', name: 'Recorded produce' },
    { id: 'A002', name: 'Recorded bakery' },
  ];

  await page.route('**/api/state', (route) => route.abort());
  await page.route('**/recorded-seed.json', (route) =>
    route.fulfill({ json: { ...recorded, aisles: walk } }),
  );
  await page.goto('/');
  await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();

  expect(await namesOnScreen(page)).toEqual(walk.map((aisle) => aisle.name));
  await expect(page.getByLabel('Add an aisle')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add aisle' })).toBeDisabled();
  for (const { name } of walk) {
    await expect(page.getByRole('button', { name: `Move ${name} up` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Move ${name} down` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Rename ${name}` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Remove ${name}` })).toBeDisabled();
  }
});
