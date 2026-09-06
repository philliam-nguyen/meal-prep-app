// The Got It mark: what a cook taps walking the aisles, and the one action that clears the lot.
//
// The mark belongs to the Ingredient rather than to a Shopping List row, which is what lets the list
// be derived on every read without losing what was ticked in the store. So the assertions here read
// the Shopping List back after doing something else entirely to it.
//
// A mark is cleared by two things and by nothing else: the cook saying the trip is over, and the
// Ingredient leaving the Shopping List because the last Selected Recipe calling for it was removed.
// The Sheets-era client carried the previous mark forward for any Ingredient whose name matched and
// the spreadsheet kept it indefinitely, so an Ingredient two trips shared arrived pre-ticked and got
// walked past. These tests pin down both what clears a mark and what leaves it standing - the
// second half being the one that matters mid-trip, when a cook comes back for a forgotten Recipe.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { readPantryChecklist, setPantry, setStaple } from './helpers/pantry.js';
import {
  createRecipe,
  readRecipes,
  readShoppingList,
  setSelected,
  updateRecipe,
} from './helpers/recipes.js';
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

  // Selecting is the half of the rule that has to stay quiet. Coming back for a forgotten Recipe
  // mid-trip must not undo the ticks already earned in the store, so a Recipe arriving on the list
  // clears nothing, including on the Ingredient it arrives holding.
  it('selecting a Recipe that shares a ticked Ingredient', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const ragu = await createRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await setSelected(app, ragu.id, true);

    assert.equal((await entryFor(app, 'Onion')).gotIt, true);
  });

  // Creating a Recipe that names a food an existing Recipe already uses attaches to the Ingredient
  // that is already there, through the `on conflict do update` in the create path. That is the one
  // route by which a write meant for a Recipe reaches a ticked Ingredient's row, so it is worth an
  // assertion rather than an inspection.
  it('adding a Recipe that names an Ingredient already ticked', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);

    await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'onion ', quantity: 1, unit: '' }],
    });

    const entry = await entryFor(app, 'Onion');
    assert.equal(entry.ingredientId, ingredientId);
    assert.equal(entry.gotIt, true);
  });

  it('marking the same Ingredient a Staple', async (t) => {
    const app = await startApp(t);
    await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Olive oil', quantity: 30, unit: 'ml' }],
    });
    const { ingredientId } = await entryFor(app, 'Olive oil');
    await setGotIt(app, ingredientId, true);

    await setStaple(app, ingredientId, true);

    assert.equal((await entryFor(app, 'Olive oil')).gotIt, true);
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

// The other half of the rule, and the one that answers the pre-ticked entry: an Ingredient that
// leaves the Shopping List loses its mark on the way out, in the same write that removed it. What
// makes this safe to do on a deselect and not on a select is that removing only ever clears what
// left, so the ticks earned in the store survive everything except the Recipe that put them there
// being taken off the list.
describe('deselecting a Recipe', () => {
  /** Two Selected Recipes sharing an Onion, with every entry on the list ticked. */
  async function twoTickedRecipes(app) {
    const minestrone = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Tomato', quantity: 400, unit: 'g' },
      ],
    });
    const ragu = await selectRecipe(app, {
      name: 'Ragu',
      type: 'Dinner',
      ingredients: [{ name: 'Onion', quantity: 1, unit: '' }],
    });
    for (const entry of await readShoppingList(app)) {
      await setGotIt(app, entry.ingredientId, true);
    }
    return { minestrone, ragu };
  }

  // Asked by putting the Recipe back, because an Ingredient off the list has no entry to read a
  // mark from. That is also exactly how a cook meets a stale tick: weeks later, cooking the same
  // thing again.
  it('clears the mark on an Ingredient that left the list', async (t) => {
    const app = await startApp(t);
    const { minestrone } = await twoTickedRecipes(app);

    await setSelected(app, minestrone.id, false);

    await setSelected(app, minestrone.id, true);
    assert.equal((await entryFor(app, 'Tomato')).gotIt, false);
  });

  it('leaves the mark on an Ingredient another Selected Recipe still needs', async (t) => {
    const app = await startApp(t);
    const { minestrone } = await twoTickedRecipes(app);

    await setSelected(app, minestrone.id, false);

    const onion = await entryFor(app, 'Onion');
    assert.equal(onion.gotIt, true);
    // Still on the list, and now only what the Recipe left behind calls for.
    assert.deepEqual(onion.amounts, [{ quantity: 1, unit: '' }]);
  });

  // The rule is about what is on the list rather than about what this one write removed, so a mark
  // that was already stale when the deselect arrived goes with the ones that just left. There is no
  // reading of "clears what left the list" under which that tick should survive.
  it('clears a mark that had already gone stale', async (t) => {
    const app = await startApp(t);
    const { minestrone, ragu } = await twoTickedRecipes(app);
    // Rewriting Minestrone without its Tomato takes it off the list on its own, and an edit clears
    // nothing: that is the stale tick, arranged the way the app can actually produce one.
    await updateRecipe(app, minestrone.id, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });

    await setSelected(app, ragu.id, false);

    await updateRecipe(app, minestrone.id, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [
        { name: 'Onion', quantity: 2, unit: '' },
        { name: 'Tomato', quantity: 400, unit: 'g' },
      ],
    });
    assert.equal((await entryFor(app, 'Tomato')).gotIt, false);
  });

  it('refuses a Recipe that is not there, and clears nothing on the way', async (t) => {
    const app = await startApp(t);
    await twoTickedRecipes(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/recipes/R404/selected',
      payload: { selected: false },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(gotItByIngredient(await readShoppingList(app)), {
      Onion: true,
      Tomato: true,
    });
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
  //
  // Arranged with an edit rather than a deselect, because a deselect clears what left the list on
  // its own now and would leave this asserting on a mark that was already gone.
  it('reaches an Ingredient no Selected Recipe currently calls for', async (t) => {
    const app = await startApp(t);
    const recipe = await selectRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    const { ingredientId } = await entryFor(app, 'Onion');
    await setGotIt(app, ingredientId, true);
    await updateRecipe(app, recipe.id, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Leek', quantity: 2, unit: '' }],
    });

    await clearGotItMarks(app);

    await updateRecipe(app, recipe.id, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
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
