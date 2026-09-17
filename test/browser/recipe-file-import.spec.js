// Dropping a file onto Add Recipe fills the form for review rather than saving straight through
// (stories 67 and 68). The shared package's own suite proves the parser reads Steps out of a file;
// what this proves is the half only a browser can say, which is that what the parser returns lands
// in the Steps rows the cook sees, the same way it already lands in the Ingredient rows.

import { expect, test } from '@playwright/test';
import { uniqueName } from './helpers/recipes.js';

const FIRST_STEP = 'Brown the beef in batches.';
const SECOND_STEP = 'Add carrots and stock, simmer two hours.';

/** The box holding the nth Step, named the way the Add and Edit forms name it. */
const stepBox = (page, position) =>
  page.getByRole('textbox', { name: `Step ${position}`, exact: true });

test('dropping a text file with an Instructions section fills the Steps rows', async ({ page }) => {
  const name = uniqueName('Beef Stew');
  const fileText =
    `Title: ${name}\n` +
    'Ingredients:\n' +
    '- 500 g beef shin\n' +
    '- 2 carrots\n' +
    'Instructions:\n' +
    `1. ${FIRST_STEP}\n` +
    `2. ${SECOND_STEP}\n`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Upload File' }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'beef-stew.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(fileText),
  });

  await expect(page.getByText('Read from your file. Check it over before saving.')).toBeVisible();

  // The Ingredient rows filled the way they already did before this file carried Steps too, so the
  // import of one section did not cost the other.
  await expect(page.getByPlaceholder('e.g., Chicken Teriyaki Bowl')).toHaveValue(name);
  await expect(page.getByPlaceholder('Ingredient').nth(0)).toHaveValue('beef shin');
  await expect(page.getByPlaceholder('Ingredient').nth(1)).toHaveValue('carrots');

  // The Steps rows filled with the ordinals stripped, ready for the cook to check before saving.
  await expect(stepBox(page, 1)).toHaveValue(FIRST_STEP);
  await expect(stepBox(page, 2)).toHaveValue(SECOND_STEP);
});
