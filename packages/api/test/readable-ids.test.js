// The ids Postgres mints for a Recipe and an Ingredient, either side of the thousandth row.
//
// ADR-0006 asked for the spreadsheet's R001 shape. The first schema wrote that as
// `lpad(nextval(...)::text, 3, '0')`, and lpad does not only pad: it cuts a string that is already
// longer than the width it is given. The thousandth row asked for "1000" and got "100", which is an
// id the hundredth row is already using. Three digits was being read as a width when it was meant
// as a floor.
//
// The sequences are moved here rather than filled a row at a time, because a thousand Recipes is a
// thousand requests. Moving one is what the operator's extract does after it loads the spreadsheet
// (ADR-0006), so this arranges a state the deployment really reaches. It runs as the owner: the app
// role can mint from a sequence and deliberately cannot move one.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { connectAsOwner } from './helpers/database.js';
import { createRecipe } from './helpers/recipes.js';

/** Leaves the sequence so that the next id it mints is `next`. */
async function nextIdWillBe(owner, sequence, next) {
  await owner.query('select setval($1, $2, false)', [sequence, next]);
}

const toast = { name: 'Toast', type: 'Breakfast' };

describe('minting a readable Recipe id', () => {
  it('pads to three digits below the thousandth', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, toast);

    assert.equal(created.id, 'R001');
  });

  it('keeps the last three-digit id whole', async (t) => {
    const app = await startApp(t);
    await nextIdWillBe(await connectAsOwner(t), 'recipe_id_seq', 999);

    const created = await createRecipe(app, toast);

    assert.equal(created.id, 'R999');
  });

  it('mints a four-digit id rather than cutting it back to three', async (t) => {
    const app = await startApp(t);
    await nextIdWillBe(await connectAsOwner(t), 'recipe_id_seq', 1000);

    const created = await createRecipe(app, toast);

    assert.equal(created.id, 'R1000');
  });

  it('mints distinct ids across the thousandth', async (t) => {
    const app = await startApp(t);
    await nextIdWillBe(await connectAsOwner(t), 'recipe_id_seq', 999);

    const before = await createRecipe(app, toast);
    const after = await createRecipe(app, { name: 'Porridge', type: 'Breakfast' });

    assert.deepEqual([before.id, after.id], ['R999', 'R1000']);
  });

  it('mints an id well past the thousandth whole', async (t) => {
    const app = await startApp(t);
    await nextIdWillBe(await connectAsOwner(t), 'recipe_id_seq', 12_345);

    const created = await createRecipe(app, toast);

    assert.equal(created.id, 'R12345');
  });
});

describe('minting a readable Ingredient id', () => {
  const withFoods = (...names) => ({
    name: 'Leek and Potato Soup',
    type: 'Soup',
    ingredients: names.map((name) => ({ name })),
  });

  it('pads to three digits below the thousandth', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, withFoods('Leek'));

    assert.equal(created.ingredients[0].ingredientId, 'I001');
  });

  it('mints a four-digit id rather than cutting it back to three', async (t) => {
    const app = await startApp(t);
    await nextIdWillBe(await connectAsOwner(t), 'ingredient_id_seq', 1000);

    const created = await createRecipe(app, withFoods('Leek'));

    assert.equal(created.ingredients[0].ingredientId, 'I1000');
  });

  // The collision the truncation caused, rather than only the wrong shape. The hundredth Ingredient
  // holds I100, and the thousandth asked for the same id and was refused by the primary key. The
  // write path read that refusal as a Recipe naming one food twice, which it never was.
  it('does not mint an id the hundredth Ingredient already holds', async (t) => {
    const app = await startApp(t);
    const owner = await connectAsOwner(t);
    await nextIdWillBe(owner, 'ingredient_id_seq', 100);
    const hundredth = await createRecipe(app, withFoods('Leek'));
    assert.equal(hundredth.ingredients[0].ingredientId, 'I100');

    await nextIdWillBe(owner, 'ingredient_id_seq', 1000);
    const thousandth = await createRecipe(app, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: 'Butter' }],
    });

    assert.equal(thousandth.ingredients[0].ingredientId, 'I1000');
  });

  it('mints distinct ids across the thousandth within one Recipe', async (t) => {
    const app = await startApp(t);
    await nextIdWillBe(await connectAsOwner(t), 'ingredient_id_seq', 999);

    const created = await createRecipe(app, withFoods('Leek', 'Potato'));

    const ids = created.ingredients.map(({ ingredientId }) => ingredientId);
    assert.deepEqual(ids, ['I999', 'I1000']);
  });
});
