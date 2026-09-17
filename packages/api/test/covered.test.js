// Covered: a Shopping List entry whose Ingredient is in the Pantry. Derived off Pantry membership
// on every read and stored nowhere, the way the list itself is - so these assertions read the list
// back after doing something else entirely to it, the same shape got-it.test.js already uses for
// the mark that does get stored.
//
// Nothing here writes Covered directly. There is no endpoint for it: the only way to move it is the
// existing Pantry write, and the only way to read it is the existing Shopping List read.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { setPantry, setStaple } from './helpers/pantry.js';
import { createRecipe, readShoppingList, setSelected } from './helpers/recipes.js';
import { clearGotItMarks, doneShopping, setGotIt } from './helpers/shopping.js';

/** Creates a Recipe and marks it a Selected Recipe, which is what puts it on the list. */
async function selectRecipe(app, body) {
  const recipe = await createRecipe(app, body);
  await setSelected(app, recipe.id, true);
  return recipe;
}

/** The list entry for one Ingredient, by the name a cook reads. */
async function entryFor(app, name) {
  const entry = (await readShoppingList(app)).find((candidate) => candidate.name === name);
  assert.ok(entry, `${name} is not on the Shopping List`);
  return entry;
}

describe('a Shopping List entry Covered by the Pantry', () => {
  it('is Covered when its Ingredient is in the Pantry, and uncovered when it is not', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Tomato', quantity: 400, unit: 'g' },
      ],
    });
    const { ingredientId } = await entryFor(app, 'Onion');

    await setPantry(app, ingredientId, true);

    assert.equal((await entryFor(app, 'Onion')).covered, true);
    assert.equal((await entryFor(app, 'Tomato')).covered, false);
  });

  it('flips to uncovered on the next read once the Ingredient leaves the Pantry, with no other write', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setPantry(app, ingredientId, true);
    assert.equal((await entryFor(app, 'Onion')).covered, true);

    await setPantry(app, ingredientId, false);

    assert.equal((await entryFor(app, 'Onion')).covered, false);
  });

  // Pantry truth is what Covered rests on, and neither of these two touches it: clearing Got It
  // marks writes only the Ingredient's mark, and Done Shopping's deselect empties the list rather
  // than changing what any Ingredient's Pantry membership says. Reselecting the Recipe afterwards
  // is how this asks, the same way done-shopping.test.js reads a mark back through it.
  it('is left standing by clearing Got It marks and by Done Shopping', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setPantry(app, ingredientId, true);
    await setGotIt(app, ingredientId, true);

    await clearGotItMarks(app);
    assert.equal((await entryFor(app, 'Onion')).covered, true);

    await doneShopping(app);
    await setSelected(app, recipe.id, true);
    assert.equal((await entryFor(app, 'Onion')).covered, true);
  });

  it('can be marked Got It while Covered, with both flags coming back true', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setPantry(app, ingredientId, true);

    await setGotIt(app, ingredientId, true);

    const entry = await entryFor(app, 'Onion');
    assert.equal(entry.covered, true);
    assert.equal(entry.gotIt, true);
  });

  // ingredients.js refuses to ever set in_pantry on a Staple (SET_PANTRY's `and not staple` guard,
  // enforced with a 400 the moment a cook tries), so a Staple's Shopping List entry can never read
  // the Pantry membership Covered is derived from as true.
  it('a Staple is never Covered, because it can never be ticked into the Pantry', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Olive oil', quantity: 30, unit: 'ml' }],
    });
    const { ingredientId } = await entryFor(app, 'Olive oil');

    await setStaple(app, ingredientId, true);
    const refusal = await app.inject({
      method: 'PUT',
      url: `/api/ingredients/${ingredientId}/pantry`,
      payload: { inPantry: true },
    });

    assert.equal(refusal.statusCode, 400);
    assert.equal((await entryFor(app, 'Olive oil')).covered, false);
  });
});
