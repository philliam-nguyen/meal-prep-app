// The Pantry, Staples, and the match rule that turns one into the other.
//
// The rule is defined fresh in SQL rather than recovered: rank by the absolute count of Missing
// Ingredients ascending, count membership rather than quantity, never count a Staple, drop Recipes
// with no Pantry overlap, and cap what comes back. These tests are the whole of its definition
// outside the query itself.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import {
  ingredientIdIn,
  readBestMatches,
  readPantryChecklist,
  readStaples,
  setPantry,
  setStaple,
} from './helpers/pantry.js';
import { createRecipe } from './helpers/recipes.js';

/** The names on the checklist, which is what a cook actually sees. */
const checklist = async (app) =>
  (await readPantryChecklist(app)).map((ingredient) => ingredient.name);

describe('the Pantry checklist', () => {
  it('holds every Ingredient the Recipes brought in', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Leek' }, { name: 'Potato' }],
    });

    assert.deepEqual(await checklist(app), ['Leek', 'Potato']);
  });

  it('is empty before any Recipe names a food', async (t) => {
    const app = await startApp(t);

    assert.deepEqual(await readPantryChecklist(app), []);
  });

  it('reports an Ingredient as out of the Pantry until it is ticked', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, { name: 'Soup', type: 'Soup', ingredients: [{ name: 'Leek' }] });

    const [leek] = await readPantryChecklist(app);

    assert.equal(leek.inPantry, false);
  });

  it('remembers a ticked Ingredient', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Soup',
      type: 'Soup',
      ingredients: [{ name: 'Leek' }],
    });

    await setPantry(app, ingredientIdIn(recipe, 'Leek'), true);

    const [leek] = await readPantryChecklist(app);
    assert.equal(leek.inPantry, true);
  });

  it('takes an Ingredient back out when it is unticked', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Soup',
      type: 'Soup',
      ingredients: [{ name: 'Leek' }],
    });
    const leekId = ingredientIdIn(recipe, 'Leek');

    await setPantry(app, leekId, true);
    await setPantry(app, leekId, false);

    const [leek] = await readPantryChecklist(app);
    assert.equal(leek.inPantry, false);
  });

  it('leaves Staples off it', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Bread',
      type: 'Bread',
      ingredients: [{ name: 'Flour' }, { name: 'Water' }],
    });

    await setStaple(app, ingredientIdIn(recipe, 'Water'), true);

    assert.deepEqual(await checklist(app), ['Flour']);
  });

  it('refuses to tick an Ingredient that is a Staple', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Bread',
      type: 'Bread',
      ingredients: [{ name: 'Water' }],
    });
    const waterId = ingredientIdIn(recipe, 'Water');
    await setStaple(app, waterId, true);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/ingredients/${waterId}/pantry`,
      payload: { inPantry: true },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /Staple/);
  });

  it('refuses to tick an Ingredient it does not hold', async (t) => {
    const app = await startApp(t);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/ingredients/I999/pantry',
      payload: { inPantry: true },
    });

    assert.equal(response.statusCode, 404);
    // Named rather than a bare status, so a refusal cannot be confused with a missing route.
    assert.match(response.json().message, /no Ingredient/);
  });

  it('shares one Ingredient between the two Recipes that call for it', async (t) => {
    const app = await startApp(t);
    const soup = await createRecipe(app, {
      name: 'Onion Soup',
      type: 'Soup',
      ingredients: [{ name: 'Onion' }, { name: 'Stock' }],
    });
    const tart = await createRecipe(app, {
      name: 'Onion Tart',
      type: 'Dinner',
      ingredients: [{ name: 'Onion' }, { name: 'Pastry' }],
    });

    await setPantry(app, ingredientIdIn(soup, 'Onion'), true);

    // Ticked once through the Soup, and the Tart is no longer missing it either.
    assert.equal(ingredientIdIn(tart, 'Onion'), ingredientIdIn(soup, 'Onion'));
    const missingByRecipe = Object.fromEntries(
      (await readBestMatches(app)).map((match) => [match.recipeId, match.missing]),
    );
    assert.deepEqual(missingByRecipe[soup.id], ['Stock']);
    assert.deepEqual(missingByRecipe[tart.id], ['Pastry']);
  });
});

describe('marking an Ingredient a Staple', () => {
  it('takes it off the Pantry checklist', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Bread',
      type: 'Bread',
      ingredients: [{ name: 'Flour' }, { name: 'Salt' }],
    });

    await setStaple(app, ingredientIdIn(recipe, 'Salt'), true);

    assert.deepEqual(await checklist(app), ['Flour']);
  });

  it('stops it counting as Missing', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Bread',
      type: 'Bread',
      ingredients: [{ name: 'Flour' }, { name: 'Salt' }],
    });
    await setPantry(app, ingredientIdIn(recipe, 'Flour'), true);

    assert.deepEqual((await readBestMatches(app))[0].missing, ['Salt']);

    await setStaple(app, ingredientIdIn(recipe, 'Salt'), true);

    assert.deepEqual((await readBestMatches(app))[0].missing, []);
  });

  it('clears the Pantry membership it was holding', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Bread',
      type: 'Bread',
      ingredients: [{ name: 'Salt' }],
    });
    const saltId = ingredientIdIn(recipe, 'Salt');
    await setPantry(app, saltId, true);

    await setStaple(app, saltId, true);
    await setStaple(app, saltId, false);

    // A Staple is assumed on hand rather than ticked, so the membership does not sit underneath it
    // waiting to come back.
    const [salt] = await readPantryChecklist(app);
    assert.equal(salt.inPantry, false);
  });

  it('lists it among the Staples, so a mistake can be undone', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Bread',
      type: 'Bread',
      ingredients: [{ name: 'Flour' }, { name: 'Salt' }],
    });

    await setStaple(app, ingredientIdIn(recipe, 'Salt'), true);

    assert.deepEqual(
      (await readStaples(app)).map((staple) => staple.name),
      ['Salt'],
    );
  });

  it('puts it back on the checklist when it stops being one', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Bread',
      type: 'Bread',
      ingredients: [{ name: 'Salt' }],
    });
    const saltId = ingredientIdIn(recipe, 'Salt');

    await setStaple(app, saltId, true);
    await setStaple(app, saltId, false);

    assert.deepEqual(await checklist(app), ['Salt']);
  });

  it('refuses an Ingredient it does not hold', async (t) => {
    const app = await startApp(t);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/ingredients/I999/staple',
      payload: { staple: true },
    });

    assert.equal(response.statusCode, 404);
    assert.match(response.json().message, /no Ingredient/);
  });
});

describe('Best Matches', () => {
  it('ranks by ascending count of Missing Ingredients', async (t) => {
    const app = await startApp(t);
    const far = await createRecipe(app, {
      name: 'Far',
      type: 'Dinner',
      ingredients: [{ name: 'Onion' }, { name: 'Beef' }, { name: 'Wine' }, { name: 'Thyme' }],
    });
    const near = await createRecipe(app, {
      name: 'Near',
      type: 'Dinner',
      ingredients: [{ name: 'Onion' }, { name: 'Egg' }],
    });
    const middling = await createRecipe(app, {
      name: 'Middling',
      type: 'Dinner',
      ingredients: [{ name: 'Onion' }, { name: 'Rice' }, { name: 'Peas' }],
    });
    await setPantry(app, ingredientIdIn(far, 'Onion'), true);

    const ranked = (await readBestMatches(app)).map((match) => match.recipeId);

    assert.deepEqual(ranked, [near.id, middling.id, far.id]);
  });

  it('names exactly the Ingredients a Recipe is Missing', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Leek and Potato Soup',
      type: 'Soup',
      ingredients: [{ name: 'Leek' }, { name: 'Potato' }, { name: 'Stock' }],
    });
    await setPantry(app, ingredientIdIn(recipe, 'Leek'), true);

    assert.deepEqual((await readBestMatches(app))[0].missing, ['Potato', 'Stock']);
  });

  it('reports a Recipe with nothing Missing as an empty list rather than a sentinel', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Buttered Toast',
      type: 'Breakfast',
      ingredients: [{ name: 'Bread' }, { name: 'Butter' }],
    });
    await setPantry(app, ingredientIdIn(recipe, 'Bread'), true);
    await setPantry(app, ingredientIdIn(recipe, 'Butter'), true);

    const [match] = await readBestMatches(app);

    assert.deepEqual(match.missing, []);
    assert.equal(Array.isArray(match.missing), true);
  });

  it('reports an empty Missing list for a Recipe whose only gaps are Staples', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, {
      name: 'Flatbread',
      type: 'Bread',
      ingredients: [{ name: 'Flour' }, { name: 'Water' }, { name: 'Salt' }],
    });
    await setStaple(app, ingredientIdIn(recipe, 'Water'), true);
    await setStaple(app, ingredientIdIn(recipe, 'Salt'), true);
    await setPantry(app, ingredientIdIn(recipe, 'Flour'), true);

    assert.deepEqual((await readBestMatches(app))[0].missing, []);
  });

  it('excludes a Recipe nothing in the Pantry appears in', async (t) => {
    const app = await startApp(t);
    const overlapping = await createRecipe(app, {
      name: 'Onion Soup',
      type: 'Soup',
      ingredients: [{ name: 'Onion' }, { name: 'Stock' }],
    });
    await createRecipe(app, {
      name: 'Apple Crumble',
      type: 'Dessert',
      ingredients: [{ name: 'Apple' }, { name: 'Oats' }],
    });
    await setPantry(app, ingredientIdIn(overlapping, 'Onion'), true);

    const ranked = (await readBestMatches(app)).map((match) => match.recipeId);

    assert.deepEqual(ranked, [overlapping.id]);
  });

  it('returns nothing at all while the Pantry is empty', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, {
      name: 'Onion Soup',
      type: 'Soup',
      ingredients: [{ name: 'Onion' }],
    });

    assert.deepEqual(await readBestMatches(app), []);
  });

  it('includes a Recipe made only of Staples, because there is nothing to buy', async (t) => {
    const app = await startApp(t);
    const flatbread = await createRecipe(app, {
      name: 'Flatbread',
      type: 'Bread',
      ingredients: [{ name: 'Flour' }, { name: 'Water' }, { name: 'Salt' }],
    });
    for (const name of ['Flour', 'Water', 'Salt']) {
      await setStaple(app, ingredientIdIn(flatbread, name), true);
    }

    // Nothing is ticked and nothing needs to be. A Staple is on hand by definition, so this Recipe
    // is cookable right now and the Pantry has nothing to say about it.
    const [match] = await readBestMatches(app);

    assert.equal(match.recipeId, flatbread.id);
    assert.deepEqual(match.missing, []);
  });

  it('still excludes a Recipe that calls for a Staple but nothing in the Pantry', async (t) => {
    const app = await startApp(t);
    const soup = await createRecipe(app, {
      name: 'Onion Soup',
      type: 'Soup',
      ingredients: [{ name: 'Onion' }, { name: 'Stock' }, { name: 'Salt' }],
    });
    await setStaple(app, ingredientIdIn(soup, 'Salt'), true);

    // Having the salt is not having the soup. Counting a Staple as overlap on its own would drag
    // every Recipe that mentions one into an answer the cook cannot cook.
    assert.deepEqual(await readBestMatches(app), []);
  });

  it('reorders as soon as an Ingredient is ticked', async (t) => {
    const app = await startApp(t);
    const stew = await createRecipe(app, {
      name: 'Beef Stew',
      type: 'Stew',
      ingredients: [{ name: 'Onion' }, { name: 'Beef' }, { name: 'Carrot' }],
    });
    const soup = await createRecipe(app, {
      name: 'Onion Soup',
      type: 'Soup',
      ingredients: [{ name: 'Onion' }, { name: 'Stock' }],
    });
    await setPantry(app, ingredientIdIn(stew, 'Onion'), true);

    const before = (await readBestMatches(app)).map((match) => match.recipeId);

    await setPantry(app, ingredientIdIn(stew, 'Beef'), true);
    await setPantry(app, ingredientIdIn(stew, 'Carrot'), true);

    const after = (await readBestMatches(app)).map((match) => match.recipeId);

    assert.deepEqual(before, [soup.id, stew.id]);
    assert.deepEqual(after, [stew.id, soup.id]);
  });

  it('breaks a tie on Missing count by Recipe name', async (t) => {
    const app = await startApp(t);
    const zucchini = await createRecipe(app, {
      name: 'Zucchini Fritters',
      type: 'Lunch',
      ingredients: [{ name: 'Onion' }, { name: 'Zucchini' }],
    });
    const apple = await createRecipe(app, {
      name: 'Apple Salad',
      type: 'Lunch',
      ingredients: [{ name: 'Onion' }, { name: 'Apple' }],
    });
    await setPantry(app, ingredientIdIn(zucchini, 'Onion'), true);

    const ranked = (await readBestMatches(app)).map((match) => match.recipeId);

    assert.deepEqual(ranked, [apple.id, zucchini.id]);
  });

  it('caps how many come back', async (t) => {
    const app = await startApp(t);
    let shared;
    for (let n = 0; n < 21; n += 1) {
      const recipe = await createRecipe(app, {
        name: `Recipe ${String(n).padStart(2, '0')}`,
        type: 'Dinner',
        ingredients: [{ name: 'Onion' }, { name: `Filler ${n}` }],
      });
      shared ??= ingredientIdIn(recipe, 'Onion');
    }
    await setPantry(app, shared, true);

    assert.equal((await readBestMatches(app)).length, 20);
  });
});
