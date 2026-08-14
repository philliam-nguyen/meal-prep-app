// Marking a Recipe as a Selected Recipe, which is the only thing that pulls Ingredients onto the
// Shopping List.
//
// The endpoint sets the flag rather than flipping it. Two phones sharing one instance can both send
// a toggle, and a flip would land whichever order they arrived in; a set is idempotent, so the last
// writer wins and a retry after a dropped response cannot undo the write it is retrying.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { createRecipe, readRecipes, setSelected } from './helpers/recipes.js';

/** Every Recipe's Selected Recipe flag, keyed by name. */
async function selectionByName(app) {
  return Object.fromEntries(
    (await readRecipes(app)).map((recipe) => [recipe.name, recipe.selected]),
  );
}

describe('marking a Recipe as a Selected Recipe', () => {
  it('reports a Recipe as Selected once it has been selected', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, { name: 'Minestrone', type: 'Soup' });

    await setSelected(app, recipe.id, true);

    assert.deepEqual(await selectionByName(app), { Minestrone: true });
  });

  it('reports a Recipe as no longer Selected once it has been deselected', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, { name: 'Minestrone', type: 'Soup' });
    await setSelected(app, recipe.id, true);

    await setSelected(app, recipe.id, false);

    assert.deepEqual(await selectionByName(app), { Minestrone: false });
  });

  it('leaves every other Recipe alone', async (t) => {
    const app = await startApp(t);
    const chosen = await createRecipe(app, { name: 'Chosen', type: 'Dinner' });
    await createRecipe(app, { name: 'Not chosen', type: 'Dinner' });

    await setSelected(app, chosen.id, true);

    assert.deepEqual(await selectionByName(app), { Chosen: true, 'Not chosen': false });
  });

  it('accepts the same selection twice, so a retry cannot undo itself', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, { name: 'Minestrone', type: 'Soup' });

    await setSelected(app, recipe.id, true);
    await setSelected(app, recipe.id, true);

    assert.deepEqual(await selectionByName(app), { Minestrone: true });
  });

  it('refuses a Recipe that does not exist', async (t) => {
    const app = await startApp(t);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/recipes/R404/selected',
      payload: { selected: true },
    });

    assert.equal(response.statusCode, 404);
    // Named rather than matched loosely: an absent route answers 404 too, and a test that cannot
    // tell the two apart would pass against an endpoint that was never added.
    assert.match(response.json().message, /no Recipe/i);
  });

  it('refuses a selection that is not a boolean', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, { name: 'Minestrone', type: 'Soup' });

    for (const payload of [{ selected: 'true' }, { selected: null }, {}, { other: true }]) {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/recipes/${recipe.id}/selected`,
        payload,
      });

      assert.equal(response.statusCode, 400, `${JSON.stringify(payload)} was not refused`);
    }
  });
});
