// The `ingredients` state field: every Ingredient the app knows, independent of any one Recipe or
// Selected Recipe, feeding the bulk Aisle-filing view on Settings.
//
// Distinct from pantry-and-best-matches.test.js, which is the same table read as two membership
// views for the Pantry checklist, and from aisle.test.js, which is filing one Ingredient into an
// Aisle. What this file proves is the one thing neither of those does: that every Ingredient shows
// up here, Staples included, with its Aisle id and Staple flag, and that Pantry membership is not
// among them.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addAisle } from './helpers/aisles.js';
import { startApp } from './helpers/app.js';
import { setStaple } from './helpers/pantry.js';
import { createRecipe, readState } from './helpers/recipes.js';
import { setAisle } from './helpers/shopping.js';

/** The Ingredients array from the state response, for assertions that only need one Ingredient. */
async function readIngredients(app) {
  return (await readState(app)).ingredients;
}

/** The entry for one Ingredient by the name a cook reads. */
async function ingredientNamed(app, name) {
  const found = (await readIngredients(app)).find((candidate) => candidate.name === name);
  assert.ok(found, `${name} is not in the ingredients list`);
  return found;
}

describe('the ingredients state field', () => {
  it('lists an Ingredient the moment a Recipe calls for it, unassigned and not a Staple', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });

    const onion = await ingredientNamed(app, 'Onion');

    assert.equal(typeof onion.id, 'string');
    assert.equal(onion.aisleId, null);
    assert.equal(onion.staple, false);
  });

  it('carries exactly id, name, Aisle id and Staple flag, no more', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });

    const onion = await ingredientNamed(app, 'Onion');

    assert.deepEqual(Object.keys(onion).sort(), ['aisleId', 'id', 'name', 'staple']);
  });

  it('carries the Aisle once one is filed, the same write the Shopping List picker makes', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });
    const produce = await addAisle(app, 'Produce');
    const ingredientId = recipe.ingredients[0].ingredientId;

    await setAisle(app, ingredientId, produce.id);

    assert.equal((await ingredientNamed(app, 'Onion')).aisleId, produce.id);
  });

  // The whole reason this list exists rather than reusing the Pantry checklist: a Staple never
  // appears there, but the initial sort of a kitchen has to be able to give one an Aisle too.
  it('includes Staples, which the Pantry checklist leaves out', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Overnight White Loaf',
      type: 'Bread',
      ingredients: [{ name: 'Salt', quantity: 1, unit: 'pinch' }],
    });
    await setStaple(app, recipe.ingredients[0].ingredientId, true);

    const salt = await ingredientNamed(app, 'Salt');

    assert.equal(salt.staple, true);
  });

  it('lists every Ingredient the app knows, not only ones on a Selected Recipe', async (t) => {
    const app = await startApp(t);
    // Never selected, so it would not appear on the Shopping List - and this list is not that one.
    await createRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });

    const names = (await readIngredients(app)).map((ingredient) => ingredient.name);

    assert.ok(names.includes('Onion'));
  });
});
