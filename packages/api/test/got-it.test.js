// The Got It mark: what a cook taps walking the aisles, and the one action that clears the lot.
//
// The mark belongs to the Ingredient rather than to a Shopping List row, which is what lets the list
// be derived on every read without losing what was ticked in the store. So the assertions here read
// the Shopping List back after doing something else entirely to it.
//
// Today the mark never resets. The Sheets-era client carried the previous one forward for any
// Ingredient whose name matched and the spreadsheet kept it indefinitely, so an Ingredient two trips
// shared arrived pre-ticked and got walked past. Clearing is deliberate, and these tests pin down
// that nothing else clears it.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { readPantryChecklist, setPantry, setStaple } from './helpers/pantry.js';
import { createRecipe, readRecipes, readShoppingList, setSelected } from './helpers/recipes.js';
import { clearGotItMarks, gotItByIngredient, setAisle, setGotIt } from './helpers/shopping.js';

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

describe('marking a Shopping List entry Got It', () => {
  it('survives the next read of the list', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');

    await setGotIt(app, ingredientId, true);

    assert.equal((await entryFor(app, 'Onion')).gotIt, true);
  });

  it('unmarks an entry the cook put back on the shelf', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await setGotIt(app, ingredientId, false);

    assert.equal((await entryFor(app, 'Onion')).gotIt, false);
  });

  // The endpoint takes the value it wants rather than asking for a flip, for the reason the Selected
  // Recipe and Pantry writes do: two phones share one list, and a retry after a dropped response
  // must not undo the write it is retrying.
  it('lands on the same mark however many times it arrives', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');

    await setGotIt(app, ingredientId, true);
    await setGotIt(app, ingredientId, true);

    assert.equal((await entryFor(app, 'Onion')).gotIt, true);
  });

  it('marks the Ingredient, so one tick answers for every Recipe calling for it', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'onion', quantity: 1, unit: '' }],
    });
    const list = await readShoppingList(app);
    assert.equal(list.length, 1);

    await setGotIt(app, list[0].ingredientId, true);

    assert.deepEqual(gotItByIngredient(await readShoppingList(app)), { Onion: true });
  });

  it('refuses an Ingredient that is not there, naming what it looked for', async (t) => {
    const app = await startApp(t);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/ingredients/I999/got-it',
      payload: { gotIt: true },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, 'There is no Ingredient I999.');
  });
});

describe('what leaves a Got It mark alone', () => {
  // The bug this ticket exists for is a mark nothing clears. The correction is not to clear it
  // eagerly: a cook adding a forgotten Recipe mid-trip must not lose the ticks earned in the store.
  it('selecting another Recipe mid-trip', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await selectRecipe(app, {
      name: 'Apple crumble',
      type: 'Dessert',
      ingredients: [{ name: 'Apple', quantity: 6, unit: '' }],
    });

    assert.deepEqual(gotItByIngredient(await readShoppingList(app)), {
      Apple: false,
      Onion: true,
    });
  });

  it('deselecting a Recipe that shares the Ingredient', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const ragu = await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await setSelected(app, ragu.id, false);

    assert.equal((await entryFor(app, 'Onion')).gotIt, true);
  });

  // An Ingredient off the list and back on keeps its mark, because the mark is on the Ingredient and
  // the list is derived. That is the pre-ticked entry the spec describes, and clearing is what
  // answers it rather than an automatic reset nobody asked for.
  it('a Recipe deselected and selected again', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await setSelected(app, recipe.id, false);
    await setSelected(app, recipe.id, true);

    assert.equal((await entryFor(app, 'Onion')).gotIt, true);
  });

  it('ticking the same Ingredient into the Pantry', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await setPantry(app, ingredientId, true);

    assert.equal((await entryFor(app, 'Onion')).gotIt, true);
  });

  it('setting the Aisle it is found in', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await setAisle(app, ingredientId, 'Produce');

    assert.equal((await entryFor(app, 'Onion')).gotIt, true);
  });
});

describe('clearing every Got It mark', () => {
  it('clears the lot in one action', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Tomato', quantity: 400, unit: 'g' },
        { name: 'Basil', quantity: null, unit: '' },
      ],
    });
    for (const entry of await readShoppingList(app)) {
      await setGotIt(app, entry.ingredientId, true);
    }

    await clearGotItMarks(app);

    assert.deepEqual(gotItByIngredient(await readShoppingList(app)), {
      Basil: false,
      Onion: false,
      Tomato: false,
    });
  });

  // The stale tick the spec describes: an Ingredient marked on one trip, off the list by the next,
  // and pre-ticked when it comes back. Clearing has to reach it, so it clears every mark rather than
  // the marks on whatever happens to be derived right now.
  it('reaches an Ingredient no Selected Recipe currently calls for', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);
    await setSelected(app, recipe.id, false);

    await clearGotItMarks(app);

    await setSelected(app, recipe.id, true);
    assert.equal((await entryFor(app, 'Onion')).gotIt, false);
  });

  it('disturbs nothing else about an Ingredient', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Salt', quantity: null, unit: '' },
      ],
    });
    const onion = await entryFor(app, 'Onion');
    const salt = await entryFor(app, 'Salt');
    await setGotIt(app, onion.ingredientId, true);
    await setAisle(app, onion.ingredientId, 'Produce');
    await setPantry(app, onion.ingredientId, true);
    await setStaple(app, salt.ingredientId, true);

    await clearGotItMarks(app);

    const cleared = await entryFor(app, 'Onion');
    assert.equal(cleared.gotIt, false);
    assert.equal(cleared.aisle, 'Produce');
    assert.deepEqual(cleared.amounts, [{ quantity: 2, unit: '' }]);
    assert.deepEqual(
      (await readPantryChecklist(app)).map((entry) => [entry.name, entry.inPantry]),
      [['Onion', true]],
    );
  });

  it('leaves the Selected Recipes and the list itself standing', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const before = await readShoppingList(app);

    await clearGotItMarks(app);

    assert.deepEqual(await readShoppingList(app), before);
    assert.deepEqual(
      (await readRecipes(app)).map((recipe) => recipe.selected),
      [true],
    );
  });

  it('is content to clear nothing when nothing is marked', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    await clearGotItMarks(app);
    await clearGotItMarks(app);

    assert.equal((await entryFor(app, 'Onion')).gotIt, false);
  });
});
