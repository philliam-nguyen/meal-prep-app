// Driving the Recipe sheet the way a person does, and asserting what a person sees: the Recipe's
// name at the top of a sheet, or no sheet at all. Nothing here reads component state or a class.

import { expect } from '@playwright/test';

/** Opens the named Recipe from the Recipes page and waits for its sheet to be readable. */
export async function openRecipe(page, name) {
  await page.goto('/');
  await page.getByRole('heading', { level: 3, name }).click();
  await expect(sheetTitle(page, name)).toBeVisible();
  // Settled, not just visible: the slide-up is still running for a moment after the title can be
  // read, and a rest position measured mid-slide is a few pixels off.
  await sheet(page, name).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
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

/** The sheet itself, for measuring and for putting a finger on. */
export function sheet(page, name) {
  return page.getByRole('dialog', { name });
}

/**
 * A finger on `target`, moved straight down by `distance` pixels (up, if negative) in `steps`
 * moves, held there while `whileHeld` runs, then lifted. Playwright has no touch drag of its own,
 * so this dispatches the touch events a finger produces, which is what the sheet listens for; a
 * synthetic touch cannot scroll content natively, which the scroll tests account for.
 */
export async function dragDown(target, distance, { steps = 8, whileHeld } = {}) {
  const box = await target.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 40);
  const touchAt = (clientY) => [{ identifier: 1, clientX: x, clientY }];

  await target.dispatchEvent('touchstart', { touches: touchAt(y), changedTouches: touchAt(y) });
  for (let step = 1; step <= steps; step += 1) {
    // A frame apart, the way a finger's moves arrive. The sheet reads a velocity off the moves, and
    // moves dispatched as fast as the protocol allows would read as a flick whatever the distance.
    await target.page().waitForTimeout(16);
    const clientY = y + (distance * step) / steps;
    await target.dispatchEvent('touchmove', { touches: touchAt(clientY), changedTouches: touchAt(clientY) });
  }
  if (whileHeld) await whileHeld();
  await target.dispatchEvent('touchend', { touches: [], changedTouches: touchAt(y + distance) });
}

/** Where the top of the sheet is on screen right now. */
export async function sheetTop(page, name) {
  return (await sheet(page, name).boundingBox()).y;
}
