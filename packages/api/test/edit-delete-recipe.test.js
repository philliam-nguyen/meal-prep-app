// Fixing a Recipe from inside the app, and removing one. This is the capability the spreadsheet
// provided by hand and the migration takes away, so what these assert is that a typo no longer
// needs a database session.
//
// An edit sends the whole Recipe rather than the field that changed, so the rules it is held to are
// the ones ticket 05 already wrote: the same schema object, enforced by the same validator. The
// tests that pin a field rule here exist to prove it is the same rule rather than a second copy.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECIPE_INGREDIENTS_MAX } from '@meal-prep/shared';
import { startApp } from './helpers/app.js';
import { connect } from './helpers/database.js';
import { markRecipe } from './helpers/flags.js';
import {
  createRecipe,
  deleteRecipe,
  readRecipes,
  readShoppingList,
  readState,
  setSelected,
  updateRecipe,
} from './helpers/recipes.js';

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

// Only ever set in the Demo Variant. The Homelab Variant leaves it false, so every assertion here
// describes behaviour the homelab never reaches (ADR-0002).
describe('a Protected Recipe', () => {
  const protectedSoup = async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    await markRecipe(await connect(t), created.id, { isProtected: true });
    return { app, created };
  };

  it('refuses an edit', async (t) => {
    const { app, created } = await protectedSoup(t);

    const refusal = await refuseEdit(app, created.id, { ...soup, name: 'Anything' }, 403);

    assert.match(refusal.message, /Leek and Potato Soup/);
  });

  it('is unchanged after a refused edit', async (t) => {
    const { app, created } = await protectedSoup(t);

    await refuseEdit(app, created.id, { ...soup, name: 'Anything', ingredients: [] }, 403);

    const [recipe] = await readRecipes(app);
    assert.equal(recipe.name, 'Leek and Potato Soup');
    assert.equal(recipe.ingredients.length, 2);
    assert.equal(created.id, recipe.id);
  });

  it('refuses a delete', async (t) => {
    const { app, created } = await protectedSoup(t);

    const refusal = await refuseDelete(app, created.id, 403);

    assert.match(refusal.message, /Leek and Potato Soup/);
  });

  it('is still there after a refused delete', async (t) => {
    const { app, created } = await protectedSoup(t);

    await refuseDelete(app, created.id, 403);

    assert.equal((await readRecipes(app)).length, 1);
    assert.equal((await readRecipes(app))[0].id, created.id);
  });

  // Putting a Recipe on the Shopping List is not editing it. A Demo Visitor has to be able to shop
  // for a seeded Recipe, or the demo is a read-only tour of the one thing the app is for. This one
  // passes the moment it is written: it is here to keep the Protected check off the Selected Recipe
  // route, not to drive it onto the two routes below.
  it('is still a Recipe a cook can shop for', async (t) => {
    const { app, created } = await protectedSoup(t);

    await setSelected(app, created.id, true);

    assert.equal((await readShoppingList(app)).length, 2);
  });

  it('accepts an edit and a delete once it is not Protected', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, soup);
    const client = await connect(t);
    await markRecipe(client, created.id, { isProtected: true });

    await markRecipe(client, created.id, { isProtected: false });

    const edited = await updateRecipe(app, created.id, { ...soup, name: 'Leek and Potato' });
    assert.equal(edited.name, 'Leek and Potato');
    await deleteRecipe(app, created.id);
    assert.deepEqual(await readRecipes(app), []);
  });
});
