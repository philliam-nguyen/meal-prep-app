// Reading a Recipe's Instructions from its sheet: Steps numbered in order when there are any, the
// Recipe Card as the way to cook when there are none, and a plain admission when there is neither.
// Both projects, because this is about what renders rather than about a finger or a mouse.
//
// Typing and reordering Steps is proven by recipe-steps.spec.js against the Add and Edit forms;
// this is what a cook sees on opening the sheet, arranged through the API so the sheet is the only
// thing under test.

import { expect, test } from '@playwright/test';
import { createRecipe, uniqueName } from './helpers/recipes.js';
import { openRecipe, sheet } from './helpers/sheet.js';

const FIRST_STEP = 'Brown the beef in batches.';
const SECOND_STEP = 'Add carrots and stock, simmer two hours.';

test('a Recipe with Steps lists them numbered under Instructions', async ({ page, request }) => {
  const recipe = await createRecipe(request, {
    name: uniqueName('Beef Stew'),
    type: 'Stew',
    steps: [FIRST_STEP, SECOND_STEP],
  });

  await openRecipe(page, recipe.name);
  const items = sheet(page, recipe.name).getByRole('listitem');

  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('1');
  await expect(items.nth(0)).toContainText(FIRST_STEP);
  await expect(items.nth(1)).toContainText('2');
  await expect(items.nth(1)).toContainText(SECOND_STEP);
});

test('a Recipe with no Steps but a Recipe Card offers the Card as the way to cook', async ({
  page,
  request,
}) => {
  const recipe = await createRecipe(request, {
    name: uniqueName('Beef Stew'),
    type: 'Stew',
    cardUrl: 'https://example.com/beef-stew',
  });

  await openRecipe(page, recipe.name);
  const sheetLocator = sheet(page, recipe.name);

  await expect(sheetLocator.getByRole('listitem')).toHaveCount(0);
  await expect(sheetLocator.getByRole('link', { name: /Recipe/ })).toHaveAttribute(
    'href',
    recipe.cardUrl,
  );
  await expect(sheetLocator.getByText('No Steps yet')).toBeVisible();
});

test('a Recipe with neither Steps nor a Recipe Card says plainly it has none', async ({
  page,
  request,
}) => {
  const recipe = await createRecipe(request, {
    name: uniqueName('Beef Stew'),
    type: 'Stew',
  });

  await openRecipe(page, recipe.name);
  const sheetLocator = sheet(page, recipe.name);

  await expect(sheetLocator.getByRole('listitem')).toHaveCount(0);
  await expect(sheetLocator.getByRole('link', { name: /Recipe/ })).toHaveCount(0);
  await expect(sheetLocator.getByText('No instructions yet.')).toBeVisible();
});
