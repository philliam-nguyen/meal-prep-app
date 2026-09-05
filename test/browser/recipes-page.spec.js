// The trivial test both projects carry: the Recipes page renders, from the live API rather than
// from the recording. Everything the harness promises is exercised by this passing at all: the
// throwaway Postgres migrated, the API booted against it, Vite proxied to it, and a browser of each
// kind rendered what came back.

import { expect, test } from '@playwright/test';
import { OFFLINE_NOTICE } from '../../packages/web/src/degraded.js';

test('the Recipes page renders from the running stack', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Recipes' })).toBeVisible();
  // The search box only renders once the first paint's request has answered.
  await expect(page.getByPlaceholder('Search recipes...')).toBeVisible();
  // And it answered from the API: the offline notice is what the page shows when it fell back to
  // the recording, which would render a Recipes page just as convincingly (ADR-0009).
  await expect(page.getByText(OFFLINE_NOTICE)).toHaveCount(0);
});
