// Driving the Recipe sheet the way a person does, and asserting what a person sees: the Recipe's
// name at the top of a sheet, or no sheet at all. Nothing here reads component state or a class.

import { expect } from '@playwright/test';

/** Opens the named Recipe from the Recipes page and waits for its sheet to be readable. */
export async function openRecipe(page, name) {
  await page.goto('/');
  await page.getByRole('heading', { level: 3, name }).click();
  await expect(sheetTitle(page, name)).toBeVisible();
}

/** The Recipe's name as the sheet shows it. Visible when the sheet is open, gone when it is not. */
export function sheetTitle(page, name) {
  return page.getByRole('heading', { level: 2, name });
}

/**
 * The sheet and the dimmed layer behind it are both gone. The layer is what a person sees as the
 * page being unreachable, so its absence is asserted the way a person would find out: the search
 * box behind it takes a click. Playwright refuses the click if anything still covers it.
 */
export async function expectSheetClosed(page, name) {
  await expect(sheetTitle(page, name)).toHaveCount(0);
  await page.getByPlaceholder('Search recipes...').click({ timeout: 2_000 });
}
