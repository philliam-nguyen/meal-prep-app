// Typing a Recipe's Steps and finding them again. The API suite proves the round trip through the
// request; what this proves is the half neither it nor a pure module can say, which is that a cook
// typing into the Add form and then opening the Edit form meets the same Steps in the same order,
// and that the controls beside each row do what their labels promise.
//
// Arranged by hand rather than through the API on purpose: the form filling this out is the thing
// under test.

import { expect, test } from '@playwright/test';
import { STEP_MAX } from '@meal-prep/shared';
import { uniqueName } from './helpers/recipes.js';
import { openRecipe } from './helpers/sheet.js';

const FIRST_STEP = 'Brown the beef in batches.';
const SECOND_STEP = 'Add carrots and stock, simmer two hours.';

/**
 * The box holding the nth Step. By its accessible name and exactly: the buttons beside it are named
 * for the same Step, and a substring match would find all three.
 */
const stepBox = (page, position) =>
  page.getByRole('textbox', { name: `Step ${position}`, exact: true });

/**
 * A Recipe part-typed into the Add form: its name and its Recipe Type, reached the way a cook
 * reaches them, which leaves the Steps to whichever test is asking about them.
 */
async function startRecipe(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByPlaceholder('e.g., Chicken Teriyaki Bowl').fill(name);
  await page.getByRole('combobox').selectOption('Stew');
}

/** Saves the form and waits for the app to say it landed. */
async function saveRecipe(page, name) {
  await page.getByRole('button', { name: 'Save Recipe' }).click();
  await expect(page.getByText(`"${name}" added!`)).toBeVisible();
}

/** Opens the named Recipe and takes its Edit form, which is where a saved Step is read back. */
async function editRecipe(page, name) {
  await openRecipe(page, name);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}

/** Types a Step into the last row and adds an empty row after it. */
async function typeStep(page, position, text) {
  await stepBox(page, position).fill(text);
  await page.getByRole('button', { name: 'Add Step' }).click();
}

test('a Recipe typed with two Steps opens for editing with both, in order', async ({ page }) => {
  const name = uniqueName('Beef Stew');

  await startRecipe(page, name);
  await stepBox(page, 1).fill(FIRST_STEP);
  await page.getByRole('button', { name: 'Add Step' }).click();
  await stepBox(page, 2).fill(SECOND_STEP);
  await saveRecipe(page, name);

  await editRecipe(page, name);

  await expect(stepBox(page, 1)).toHaveValue(FIRST_STEP);
  await expect(stepBox(page, 2)).toHaveValue(SECOND_STEP);
});

// Reordering is the reason the rows carry controls at all: a cook who typed the simmer before the
// browning fixes the order rather than retyping both lines.
test('a Step moved up is saved in its new place', async ({ page }) => {
  const name = uniqueName('Beef Stew');

  await startRecipe(page, name);
  await typeStep(page, 1, FIRST_STEP);
  await stepBox(page, 2).fill(SECOND_STEP);
  await page.getByRole('button', { name: 'Move step 2 up' }).click();
  await expect(stepBox(page, 1)).toHaveValue(SECOND_STEP);
  await saveRecipe(page, name);

  await editRecipe(page, name);

  await expect(stepBox(page, 1)).toHaveValue(SECOND_STEP);
  await expect(stepBox(page, 2)).toHaveValue(FIRST_STEP);
});

test('a Step moved down is saved in its new place', async ({ page }) => {
  const name = uniqueName('Beef Stew');

  await startRecipe(page, name);
  await typeStep(page, 1, SECOND_STEP);
  await stepBox(page, 2).fill(FIRST_STEP);
  await page.getByRole('button', { name: 'Move step 1 down' }).click();
  await expect(stepBox(page, 1)).toHaveValue(FIRST_STEP);
  await saveRecipe(page, name);

  await editRecipe(page, name);

  await expect(stepBox(page, 1)).toHaveValue(FIRST_STEP);
  await expect(stepBox(page, 2)).toHaveValue(SECOND_STEP);
});

test('a Step removed before saving is not saved', async ({ page }) => {
  const name = uniqueName('Beef Stew');

  await startRecipe(page, name);
  await typeStep(page, 1, FIRST_STEP);
  await stepBox(page, 2).fill(SECOND_STEP);
  await page.getByRole('button', { name: 'Remove step 1' }).click();
  await saveRecipe(page, name);

  await editRecipe(page, name);

  await expect(stepBox(page, 1)).toHaveValue(SECOND_STEP);
  await expect(stepBox(page, 2)).toHaveCount(0);
});

// A blank row is scaffolding rather than a Step: the API refuses an empty one, so a cook who adds a
// row and leaves it is saved rather than stopped.
test('a Recipe saves with a blank Step row left behind', async ({ page }) => {
  const name = uniqueName('Beef Stew');

  await startRecipe(page, name);
  await typeStep(page, 1, FIRST_STEP);
  await saveRecipe(page, name);

  await editRecipe(page, name);

  await expect(stepBox(page, 1)).toHaveValue(FIRST_STEP);
  await expect(stepBox(page, 2)).toHaveCount(0);
});

// Refused on the form rather than only by the API, because the form compiles the same schema the
// API enforces (ADR-0005). What the cook sees is the number, not a validator's word for it.
test('a Step longer than the cap is refused with a message on the form', async ({ page }) => {
  const name = uniqueName('Beef Stew');

  await startRecipe(page, name);
  await stepBox(page, 1).fill('x'.repeat(STEP_MAX + 1));
  await page.getByRole('button', { name: 'Save Recipe' }).click();

  await expect(page.getByText(`Keep this under ${STEP_MAX} characters.`)).toBeVisible();
  await expect(page.getByText(`"${name}" added!`)).toHaveCount(0);
});
