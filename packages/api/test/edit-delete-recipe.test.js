// Fixing a Recipe from inside the app, and removing one. This is the capability the spreadsheet
// provided by hand and the migration takes away, so what these assert is that a typo no longer
// needs a database session.
//
// An edit sends the whole Recipe rather than the field that changed, so the rules it is held to are
// the ones ticket 05 already wrote: the same schema object, enforced by the same validator. The
// tests that pin a field rule here exist to prove it is the same rule rather than a second copy.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECIPE_ID_MAX, RECIPE_INGREDIENTS_MAX } from '@meal-prep/shared';
import { startApp } from './helpers/app.js';
import { connect } from './helpers/database.js';
import { setPantry } from './helpers/pantry.js';
import {
  createRecipe,
  deleteRecipe,
  readRecipes,
  readShoppingList,
  readState,
  setSelected,
  updateRecipe,
} from './helpers/recipes.js';
import { setAisle, setGotIt } from './helpers/shopping.js';

const soup = {
  name: 'Leek and Potato Soup',
  type: 'Soup',
  cardUrl: 'https://example.com/leek-and-potato',
  ingredients: [
    { name: 'Leek', quantity: 3, unit: '' },
    { name: 'Potato', quantity: 500, unit: 'g' },
  ],
};

const refuseEdit = async (app, recipeId, payload, expected) => {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/recipes/${recipeId}`,
    payload,
  });
  assert.equal(response.statusCode, expected, `expected ${expected}, got ${response.statusCode}`);
  return response.json();
};

const refuseDelete = async (app, recipeId, expected) => {
  const response = await app.inject({ method: 'DELETE', url: `/api/recipes/${recipeId}` });
  assert.equal(response.statusCode, expected, `expected ${expected}, got ${response.statusCode}`);
  return response.json();
};

/** The Recipe Ingredients of a Recipe, in the shape the assertions here compare. */
const amounts = (recipe) =>
  recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit }));

describe('editing what a Recipe is', () => {
  it('changes the name', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, { ...soup, name: 'Leek and Potato' });

    assert.equal(edited.name, 'Leek and Potato');
  });

  it('changes the Recipe Type', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, { ...soup, type: 'Dinner' });

    assert.equal(edited.type, 'Dinner');
  });

  it('changes the Recipe Card', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, {
      ...soup,
      cardUrl: 'https://example.com/corrected',
    });

    assert.equal(edited.cardUrl, 'https://example.com/corrected');
  });

  it('takes the Recipe Card away', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, { ...soup, cardUrl: null });

    assert.equal(edited.cardUrl, null);
  });

  it('keeps the id the Recipe was minted with', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, { ...soup, name: 'Leek and Potato' });

    assert.equal(edited.id, created.id);
  });

  it('persists, so the browse list shows the edit', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await updateRecipe(app, created.id, { ...soup, name: 'Leek and Potato' });

    const [recipe] = await readRecipes(app);
    assert.equal(recipe.name, 'Leek and Potato');
  });

  it('trims the name rather than storing the whitespace around it', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, { ...soup, name: '  Leek and Potato  ' });

    assert.equal(edited.name, 'Leek and Potato');
  });

  // The body names no Selected Recipe flag, so an edit must not quietly clear one. A cook correcting
  // a typo on a Recipe they are shopping for would otherwise lose it off the list.
  it('leaves a Selected Recipe on the Shopping List', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    await setSelected(app, created.id, true);

    const edited = await updateRecipe(app, created.id, { ...soup, name: 'Leek and Potato' });

    assert.equal(edited.selected, true);
    assert.equal((await readShoppingList(app)).length, 2);
  });

  // The exact refusal rather than a match, because a route that does not exist answers 404 too. A
  // loose assertion here would pass against a missing endpoint.
  it('refuses a Recipe that is not there', async (t) => {
    const app = await startApp(t);

    const refusal = await refuseEdit(app, 'R404', soup, 404);

    assert.deepEqual(refusal, { message: 'There is no Recipe R404.' });
  });
});

describe('editing a Recipe Ingredient', () => {
  it('changes a quantity', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: 750, unit: 'g' },
      ],
    });

    assert.deepEqual(amounts(edited), [
      { name: 'Leek', quantity: 3, unit: '' },
      { name: 'Potato', quantity: 750, unit: 'g' },
    ]);
  });

  it('changes a unit', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: 500, unit: 'kg' },
      ],
    });

    assert.deepEqual(amounts(edited), [
      { name: 'Leek', quantity: 3, unit: '' },
      { name: 'Potato', quantity: 500, unit: 'kg' },
    ]);
  });

  it('makes a quantified Recipe Ingredient unquantified rather than zero', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: null, unit: '' },
      ],
    });

    assert.deepEqual(amounts(edited), [
      { name: 'Leek', quantity: 3, unit: '' },
      { name: 'Potato', quantity: null, unit: '' },
    ]);
  });
});

describe('changing which Ingredients a Recipe calls for', () => {
  it('adds a Recipe Ingredient', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [...soup.ingredients, { name: 'Cream', quantity: 100, unit: 'ml' }],
    });

    assert.deepEqual(amounts(edited), [
      { name: 'Cream', quantity: 100, unit: 'ml' },
      { name: 'Leek', quantity: 3, unit: '' },
      { name: 'Potato', quantity: 500, unit: 'g' },
    ]);
  });

  it('removes a Recipe Ingredient', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [{ name: 'Potato', quantity: 500, unit: 'g' }],
    });

    assert.deepEqual(amounts(edited), [{ name: 'Potato', quantity: 500, unit: 'g' }]);
  });

  it('leaves a Recipe calling for nothing when every Recipe Ingredient goes', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, { ...soup, ingredients: [] });

    assert.deepEqual(edited.ingredients, []);
  });

  // The Ingredient has an identity of its own, so an edit attaches to the row another Recipe already
  // uses rather than minting a second one and splitting Aisle and Pantry state across two spellings.
  it('attaches a food another Recipe already uses to that same Ingredient', async (t) => {
    const app = await startApp(t);
    const shortbread = await createRecipe(app, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: 'Butter', quantity: 250, unit: 'g' }],
    });
    const created = await createRecipe(app, soup);

    const edited = await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [{ name: ' butter ', quantity: 30, unit: 'g' }],
    });

    assert.equal(edited.ingredients[0].ingredientId, shortbread.ingredients[0].ingredientId);
    assert.equal(edited.ingredients[0].name, 'Butter');
  });

  // The Ingredient outlives the Recipe Ingredient that referenced it, because it carries Pantry
  // membership, an Aisle and a Got It mark that nothing else holds.
  it('leaves the Ingredient behind when a Recipe stops calling for it', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [{ name: 'Potato', quantity: 500, unit: 'g' }],
    });

    const { pantryChecklist } = await readState(app);
    assert.deepEqual(
      pantryChecklist.map(({ name }) => name),
      ['Leek', 'Potato'],
    );
  });

  it('refuses an edit naming one food twice', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    const refusal = await refuseEdit(
      app,
      created.id,
      {
        ...soup,
        ingredients: [
          { name: 'Butter', quantity: 30, unit: 'g' },
          { name: ' butter ', quantity: 10, unit: 'g' },
        ],
      },
      400,
    );

    assert.match(refusal.message, /twice/);
  });
});

// Every rule below is ticket 05's, enforced by the same schema object. What these prove is that an
// edit is held to it, not that the rule exists.
describe("holding an edit to the rules a create is held to", () => {
  it('refuses a Recipe Card that is not https', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await refuseEdit(app, created.id, { ...soup, cardUrl: 'javascript:alert(1)' }, 400);
  });

  it('refuses a name that is only whitespace', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await refuseEdit(app, created.id, { ...soup, name: '   ' }, 400);
  });

  it('refuses an unknown Recipe Type', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await refuseEdit(app, created.id, { ...soup, type: 'Elevenses' }, 400);
  });

  it('refuses a quantity of zero', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await refuseEdit(
      app,
      created.id,
      { ...soup, ingredients: [{ name: 'Leek', quantity: 0 }] },
      400,
    );
  });

  it('refuses more Recipe Ingredients than the cap allows', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    const ingredients = Array.from({ length: RECIPE_INGREDIENTS_MAX + 1 }, (_, index) => ({
      name: `Ingredient ${index}`,
    }));

    await refuseEdit(app, created.id, { ...soup, ingredients }, 400);
  });

  // Protected is not a field a caller may send, so an edit cannot promote itself out of reach.
  it('refuses a property the schema does not name', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await refuseEdit(app, created.id, { ...soup, protected: true }, 400);
  });

  it('leaves the Recipe as it was when it refuses', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await refuseEdit(app, created.id, { ...soup, name: '   ' }, 400);

    const [recipe] = await readRecipes(app);
    assert.equal(recipe.name, 'Leek and Potato Soup');
    assert.deepEqual(amounts(recipe), [
      { name: 'Leek', quantity: 3, unit: '' },
      { name: 'Potato', quantity: 500, unit: 'g' },
    ]);
  });
});

// A Recipe is its name, its Recipe Type, its Recipe Card and the Ingredients it calls for, so an
// edit that changes any of those has changed the Recipe. `recipe_ingredients` carries no timestamp
// of its own and the trigger on `recipes` only fires when that row differs, so an edit touching
// only the Recipe Ingredients would move nothing without the write saying so.
//
// The column has no API surface yet. It is read directly here because ticket 10's freshness
// endpoint is going to report the maximum update timestamp across mutable state, and this is what
// makes that report true of an edit rather than only of a rename.
describe('recording when a Recipe was last changed', () => {
  const updatedAt = async (client, recipeId) => {
    const { rows } = await client.query('select updated_at from recipes where id = $1', [recipeId]);
    return rows[0].updated_at;
  };

  it('moves the timestamp when only a Recipe Ingredient changes', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    const created = await createRecipe(app, soup);
    const before = await updatedAt(client, created.id);

    await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: 750, unit: 'g' },
      ],
    });

    assert.ok(
      (await updatedAt(client, created.id)) > before,
      'an edit changing only a Recipe Ingredient left the Recipe looking untouched',
    );
  });

  it('moves the timestamp when a Recipe Ingredient is removed', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    const created = await createRecipe(app, soup);
    const before = await updatedAt(client, created.id);

    await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [{ name: 'Leek', quantity: 3, unit: '' }],
    });

    assert.ok((await updatedAt(client, created.id)) > before);
  });

  it('moves the timestamp when the name changes', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    const created = await createRecipe(app, soup);
    const before = await updatedAt(client, created.id);

    await updateRecipe(app, created.id, { ...soup, name: 'Leek and Potato' });

    assert.ok((await updatedAt(client, created.id)) > before);
  });

  it('leaves the timestamp alone when an edit is refused', async (t) => {
    const app = await startApp(t);
    const client = await connect(t);
    const created = await createRecipe(app, soup);
    const before = await updatedAt(client, created.id);

    await refuseEdit(app, created.id, { ...soup, name: '   ' }, 400);

    assert.deepEqual(await updatedAt(client, created.id), before);
  });
});

describe('deleting a Recipe', () => {
  it('takes it out of the browse list', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await deleteRecipe(app, created.id);

    assert.deepEqual(await readRecipes(app), []);
  });

  // The Shopping List is derived from the Selected Recipes on every read, so a deleted Recipe has
  // nothing left to contribute. Nobody shops for a Recipe that no longer exists.
  it('takes what it called for off the Shopping List', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    await setSelected(app, created.id, true);
    assert.equal((await readShoppingList(app)).length, 2);

    await deleteRecipe(app, created.id);

    assert.deepEqual(await readShoppingList(app), []);
  });

  it('leaves what another Selected Recipe calls for on the Shopping List', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    const shortbread = await createRecipe(app, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: 'Butter', quantity: 250, unit: 'g' }],
    });
    await setSelected(app, created.id, true);
    await setSelected(app, shortbread.id, true);

    await deleteRecipe(app, created.id);

    assert.deepEqual(
      (await readShoppingList(app)).map(({ name }) => name),
      ['Butter'],
    );
  });

  it('leaves the Ingredients behind, because they carry Pantry state of their own', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);

    await deleteRecipe(app, created.id);

    const { pantryChecklist } = await readState(app);
    assert.deepEqual(
      pantryChecklist.map(({ name }) => name),
      ['Leek', 'Potato'],
    );
  });

  // Exact, for the reason the edit's 404 is exact: a missing route answers 404 as well.
  it('refuses a Recipe that is not there', async (t) => {
    const app = await startApp(t);

    const refusal = await refuseDelete(app, 'R404', 404);

    assert.deepEqual(refusal, { message: 'There is no Recipe R404.' });
  });
});

// Before this ticket the Ingredients table was bounded without anything saying so: the only way to
// mint an Ingredient was creating a Recipe, and Recipes could never be freed, so the table could
// never hold more than every Recipe's worth of them. Editing breaks that on its own — a Recipe
// rewritten with a hundred new foods leaves the old hundred behind and can be rewritten again —
// and deleting hands back Recipe slots on top. The ceiling is the one that was already true
// (ADR-0001).
describe('bounding the Ingredients an instance can hold', () => {
  // One Recipe's worth, so the ceiling is a hundred and one Recipe at the per-Recipe cap fills it.
  // Small so the suite stays quick: what is under test is the ceiling, and a ceiling of a hundred
  // exercises it exactly as a ceiling of fifty thousand would.
  const oneRecipesWorth = { guardrails: { recipesMax: 1 } };
  const twoRecipesWorth = { guardrails: { recipesMax: 2 } };

  const foods = (prefix, count = RECIPE_INGREDIENTS_MAX) =>
    Array.from({ length: count }, (_, index) => ({ name: `${prefix}${index}` }));

  /** A Recipe holding a full hundred foods, which is the whole ceiling when recipesMax is 1. */
  const recipeAtTheCeiling = async (app) =>
    createRecipe(app, { name: 'Everything', type: 'Dinner', ingredients: foods('first-') });

  it('refuses an edit that would push it past the ceiling', async (t) => {
    const app = await startApp(t, oneRecipesWorth);
    const created = await recipeAtTheCeiling(app);

    const refusal = await refuseEdit(
      app,
      created.id,
      { name: 'Everything', type: 'Dinner', ingredients: foods('second-') },
      409,
    );

    assert.match(refusal.message, /100 Ingredients/);
  });

  it('leaves the Recipe as it was when it refuses', async (t) => {
    const app = await startApp(t, oneRecipesWorth);
    const created = await recipeAtTheCeiling(app);

    await refuseEdit(
      app,
      created.id,
      { name: 'Renamed', type: 'Soup', ingredients: foods('second-') },
      409,
    );

    const [recipe] = await readRecipes(app);
    assert.equal(recipe.name, 'Everything');
    assert.equal(recipe.type, 'Dinner');
    assert.equal(recipe.ingredients.length, RECIPE_INGREDIENTS_MAX);
    assert.ok(recipe.ingredients.every(({ name }) => name.startsWith('first-')));
  });

  // The cap bounds what an instance holds, not what a cook may do. An edit naming foods already
  // there creates no row, so a full instance is still correctable.
  it('allows an edit that names Ingredients already there', async (t) => {
    const app = await startApp(t, oneRecipesWorth);
    const created = await recipeAtTheCeiling(app);

    const edited = await updateRecipe(app, created.id, {
      name: 'Everything Renamed',
      type: 'Soup',
      ingredients: foods('first-', 40),
    });

    assert.equal(edited.name, 'Everything Renamed');
    assert.equal(edited.ingredients.length, 40);
  });

  // Creating cannot pass the ceiling on its own, because a Recipe is capped at a hundred Recipe
  // Ingredients and the ceiling is every Recipe's worth of them. It can once an edit has left a
  // hundred orphans behind.
  it('refuses a create once an edit has filled the table', async (t) => {
    const app = await startApp(t, twoRecipesWorth);
    const created = await recipeAtTheCeiling(app);
    await updateRecipe(app, created.id, {
      name: 'Everything',
      type: 'Dinner',
      ingredients: foods('second-'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/recipes',
      payload: { name: 'One More', type: 'Soup', ingredients: foods('third-') },
    });

    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.json().message, /200 Ingredients/);
    assert.equal((await readRecipes(app)).length, 1);
  });

  it('leaves an ordinary instance alone', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, soup);
    const edited = await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [...soup.ingredients, { name: 'Cream', quantity: 100, unit: 'ml' }],
    });

    assert.equal(edited.ingredients.length, 3);
  });

  // The slow one, and the only test here that fills a table rather than a corner of it. It crosses
  // the thousandth Ingredient, which is where the id generator used to cut ids back to three
  // characters and refuse the write for a reason that had nothing to do with a ceiling
  // (0003_readable_ids_past_999.sql). The ceiling has to be the thing that stops this, not that.
  it('holds past the thousandth Ingredient', async (t) => {
    const app = await startApp(t, { guardrails: { recipesMax: 10 } });
    const created = await recipeAtTheCeiling(app);

    for (let round = 1; round < 10; round += 1) {
      await updateRecipe(app, created.id, {
        name: 'Everything',
        type: 'Dinner',
        ingredients: foods(`round${round}-`),
      });
    }

    const refusal = await refuseEdit(
      app,
      created.id,
      { name: 'Everything', type: 'Dinner', ingredients: foods('overflow-') },
      409,
    );

    assert.match(refusal.message, /1000 Ingredients/);
  });
});

// The refusal a full instance gives says "Delete one to add another". Nothing made that true until
// this ticket, and nothing proved it.
describe('deleting a Recipe to make room for another', () => {
  it('frees a slot under the Recipe cap', async (t) => {
    const app = await startApp(t, { guardrails: { recipesMax: 1 } });
    const created = await createRecipe(app, soup);

    const refused = await app.inject({
      method: 'POST',
      url: '/api/recipes',
      payload: { name: 'Shortbread', type: 'Dessert' },
    });
    assert.equal(refused.statusCode, 409);

    await deleteRecipe(app, created.id);

    const shortbread = await createRecipe(app, { name: 'Shortbread', type: 'Dessert' });
    assert.equal(shortbread.name, 'Shortbread');
  });
});

// What the upsert is for. A Recipe dropping an Ingredient and picking it up again must land on the
// row that already exists, or the Aisle and the Got It mark the cook set go with the old one and
// the Shopping List starts asking them to buy something they have already got.
describe('an Ingredient outliving the Recipe Ingredient that named it', () => {
  it('keeps its Aisle and Got It mark across a removal and a re-add', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    const potato = created.ingredients.find(({ name }) => name === 'Potato');
    await setGotIt(app, potato.ingredientId, true);
    await setAisle(app, potato.ingredientId, 'Produce');

    await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [{ name: 'Leek', quantity: 3, unit: '' }],
    });
    const readded = await updateRecipe(app, created.id, soup);

    const restored = readded.ingredients.find(({ name }) => name === 'Potato');
    assert.equal(restored.ingredientId, potato.ingredientId);

    await setSelected(app, created.id, true);
    const entry = (await readShoppingList(app)).find(({ name }) => name === 'Potato');
    assert.equal(entry.gotIt, true);
    assert.equal(entry.aisle, 'Produce');
  });

  it('keeps its Pantry membership across a removal', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    const potato = created.ingredients.find(({ name }) => name === 'Potato');
    await setPantry(app, potato.ingredientId, true);

    await updateRecipe(app, created.id, {
      ...soup,
      ingredients: [{ name: 'Leek', quantity: 3, unit: '' }],
    });

    const { pantryChecklist } = await readState(app);
    assert.equal(pantryChecklist.find(({ id }) => id === potato.ingredientId).inPantry, true);
  });
});

// The id cap keeps a long string out of a query and out of a refusal that echoes it back. Asserted
// on these routes rather than assumed from the schema object being shared.
describe('refusing an id no Recipe could carry', () => {
  const tooLong = 'R'.repeat(RECIPE_ID_MAX + 1);

  it('refuses it on an edit', async (t) => {
    const app = await startApp(t);

    await refuseEdit(app, tooLong, soup, 400);
  });

  it('refuses it on a delete', async (t) => {
    const app = await startApp(t);

    await refuseDelete(app, tooLong, 400);
  });
});

// Protected is the one refusal on these two routes that is not about the request. It moved to
// test/seed.test.js when ticket 12 landed, because the Seed is the only thing that sets the flag and
// a test that set it by hand was arranging a row the application could not produce (ADR-0005).
