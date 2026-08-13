// Adding a Recipe. Every rule asserted here lives in the schema module the Add form also compiles,
// so a refusal proven at this boundary is the same refusal the form shows before it sends.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INGREDIENT_NAME_MAX,
  QUANTITY_MAX,
  RECIPE_INGREDIENTS_MAX,
  RECIPE_NAME_MAX,
  UNIT_MAX,
} from '@meal-prep/shared';
import { startApp } from './helpers/app.js';
import { createRecipe, readRecipes } from './helpers/recipes.js';

const refuse = async (app, payload) => {
  const response = await app.inject({ method: 'POST', url: '/api/recipes', payload });
  assert.equal(response.statusCode, 400, `expected a refusal, got ${response.statusCode}`);
  return response.json();
};

const soup = {
  name: 'Leek and Potato Soup',
  type: 'Soup',
  cardUrl: 'https://example.com/leek-and-potato',
  ingredients: [
    { name: 'Leek', quantity: 3, unit: '' },
    { name: 'Potato', quantity: 500, unit: 'g' },
  ],
};

describe('adding a Recipe', () => {
  it('returns the created Recipe with an id Postgres minted', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, soup);

    assert.match(created.id, /^R\d{3,}$/);
    assert.equal(created.name, 'Leek and Potato Soup');
    assert.equal(created.type, 'Soup');
    assert.equal(created.cardUrl, 'https://example.com/leek-and-potato');
    assert.equal(created.selected, false);
    assert.equal(created.protected, false);
  });

  it('puts the Recipe and its Recipe Ingredients in the browse list', async (t) => {
    const app = await startApp(t);

    await createRecipe(app, soup);

    const [recipe] = await readRecipes(app);
    assert.equal(recipe.name, 'Leek and Potato Soup');
    assert.deepEqual(
      recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
      [
        { name: 'Leek', quantity: 3, unit: '' },
        { name: 'Potato', quantity: 500, unit: 'g' },
      ],
    );
  });

  it('accepts a Recipe with no Recipe Card and no Recipe Ingredients', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, { name: 'Toast', type: 'Breakfast' });

    assert.equal(created.cardUrl, null);
    assert.deepEqual(created.ingredients, []);
  });

  it('stores an omitted quantity as unquantified rather than as zero', async (t) => {
    const app = await startApp(t);

    await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Black pepper' }, { name: 'Salt', quantity: null }],
    });

    const [{ ingredients }] = await readRecipes(app);
    assert.deepEqual(
      ingredients.map(({ name, quantity }) => ({ name, quantity })),
      [
        { name: 'Black pepper', quantity: null },
        { name: 'Salt', quantity: null },
      ],
    );
  });

  it('trims the Recipe name rather than storing the whitespace around it', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, { name: '  Toast  ', type: 'Breakfast' });

    assert.equal(created.name, 'Toast');
  });
});

describe('refusing a Recipe Card that is not https', () => {
  it('refuses a javascript: URL', async (t) => {
    const app = await startApp(t);

    await refuse(app, { ...soup, cardUrl: 'javascript:alert(document.cookie)' });

    assert.deepEqual(await readRecipes(app), []);
  });

  it('refuses a plain http: URL', async (t) => {
    const app = await startApp(t);

    await refuse(app, { ...soup, cardUrl: 'http://example.com/leek' });
  });

  it('refuses a data: URL', async (t) => {
    const app = await startApp(t);

    await refuse(app, { ...soup, cardUrl: 'data:text/html,<script>alert(1)</script>' });
  });

  it('refuses a URL over the length cap', async (t) => {
    const app = await startApp(t);

    await refuse(app, { ...soup, cardUrl: `https://example.com/${'a'.repeat(500)}` });
  });
});

describe('refusing a Recipe that breaks a field rule', () => {
  it('refuses a name over the length cap', async (t) => {
    const app = await startApp(t);

    await refuse(app, { name: 'a'.repeat(RECIPE_NAME_MAX + 1), type: 'Soup' });
  });

  it('refuses an empty name', async (t) => {
    const app = await startApp(t);

    await refuse(app, { name: '', type: 'Soup' });
  });

  it('refuses a name that is only whitespace', async (t) => {
    const app = await startApp(t);

    await refuse(app, { name: '   ', type: 'Soup' });
  });

  it('refuses an unknown Recipe Type', async (t) => {
    const app = await startApp(t);

    await refuse(app, { name: 'Leek and Potato Soup', type: 'Elevenses' });
  });

  it('refuses a missing Recipe Type', async (t) => {
    const app = await startApp(t);

    await refuse(app, { name: 'Leek and Potato Soup' });
  });

  it('refuses a property the schema does not name', async (t) => {
    const app = await startApp(t);

    await refuse(app, { ...soup, protected: true });
  });
});

describe('refusing a Recipe Ingredient that breaks a field rule', () => {
  const withIngredient = (ingredient) => ({ name: 'Soup', type: 'Soup', ingredients: [ingredient] });

  it('refuses a quantity of zero', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: 'Leek', quantity: 0 }));
  });

  it('refuses a negative quantity', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: 'Leek', quantity: -3 }));
  });

  it('refuses a quantity too small for the column to hold', async (t) => {
    const app = await startApp(t);

    // quantity is numeric(10, 3). Anything under half a thousandth rounds to zero on the way in,
    // so accepting it would store the zero the rule above refuses.
    await refuse(app, withIngredient({ name: 'Leek', quantity: 0.0001 }));
  });

  it('refuses a quantity above the range', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: 'Leek', quantity: QUANTITY_MAX + 1 }));
  });

  it('refuses a quantity sent as text', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: 'Leek', quantity: '3' }));
  });

  it('refuses an Ingredient name over the length cap', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: 'a'.repeat(INGREDIENT_NAME_MAX + 1) }));
  });

  it('refuses an empty Ingredient name', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: '  ' }));
  });

  it('refuses a unit over the length cap', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: 'Leek', unit: 'a'.repeat(UNIT_MAX + 1) }));
  });

  it('refuses a unit outside the character allowlist', async (t) => {
    const app = await startApp(t);

    await refuse(app, withIngredient({ name: 'Leek', unit: '<script>' }));
  });

  it('refuses more Recipe Ingredients than the cap allows', async (t) => {
    const app = await startApp(t);
    const ingredients = Array.from({ length: RECIPE_INGREDIENTS_MAX + 1 }, (_, index) => ({
      name: `Ingredient ${index}`,
    }));

    await refuse(app, { name: 'Everything', type: 'Dinner', ingredients });
  });

  it('accepts exactly the cap', async (t) => {
    const app = await startApp(t);
    const ingredients = Array.from({ length: RECIPE_INGREDIENTS_MAX }, (_, index) => ({
      name: `Ingredient ${index}`,
    }));

    const created = await createRecipe(app, { name: 'Everything', type: 'Dinner', ingredients });

    assert.equal(created.ingredients.length, RECIPE_INGREDIENTS_MAX);
  });
});

describe('keeping one Ingredient per food', () => {
  it('attaches a food an existing Recipe uses to that same Ingredient', async (t) => {
    const app = await startApp(t);

    await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Butter', quantity: 30, unit: 'g' }],
    });
    await createRecipe(app, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: 'Butter', quantity: 250, unit: 'g' }],
    });

    const [soupRecipe, shortbread] = await readRecipes(app);
    assert.equal(soupRecipe.ingredients[0].ingredientId, shortbread.ingredients[0].ingredientId);
    assert.notEqual(soupRecipe.ingredients[0].quantity, shortbread.ingredients[0].quantity);
  });

  it('treats another spelling of one food as the same Ingredient', async (t) => {
    const app = await startApp(t);

    await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Butter', quantity: 30, unit: 'g' }],
    });
    await createRecipe(app, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: '  butter ', quantity: 250, unit: 'g' }],
    });

    const [soupRecipe, shortbread] = await readRecipes(app);
    assert.equal(soupRecipe.ingredients[0].ingredientId, shortbread.ingredients[0].ingredientId);
    assert.equal(shortbread.ingredients[0].name, 'Butter');
  });

  it('refuses one Recipe naming the same food twice', async (t) => {
    const app = await startApp(t);

    await refuse(app, {
      name: 'Butter on butter',
      type: 'Snack',
      ingredients: [
        { name: 'Butter', quantity: 30, unit: 'g' },
        { name: ' butter ', quantity: 10, unit: 'g' },
      ],
    });
  });
});

// What these prove is that the repeated-Ingredient refusal happens before anything is written, not
// that the transaction rolls back. Reaching the rollback needs JavaScript and Postgres to disagree
// about folding two spellings into one name, which no input here is known to produce, so that path
// is deliberate insurance rather than tested behaviour.
describe('a refused Recipe leaving nothing behind', () => {
  const namesOneIngredientTwice = {
    name: 'Butter on butter',
    type: 'Snack',
    ingredients: [{ name: 'Butter' }, { name: 'butter' }],
  };

  it('writes no Recipe', async (t) => {
    const app = await startApp(t);

    await refuse(app, namesOneIngredientTwice);

    assert.deepEqual(await readRecipes(app), []);
  });

  it('writes no Ingredient', async (t) => {
    const app = await startApp(t);
    await refuse(app, namesOneIngredientTwice);

    const created = await createRecipe(app, {
      name: 'Shortbread',
      type: 'Dessert',
      ingredients: [{ name: 'Butter', quantity: 250, unit: 'g' }],
    });

    // Ingredient ids come from a sequence, and a sequence does not roll back. I001 landing here is
    // what says the refusal came before any insert was attempted rather than after one was undone.
    assert.equal(created.ingredients[0].ingredientId, 'I001');
  });
});
