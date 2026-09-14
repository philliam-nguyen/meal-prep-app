// A Recipe's Steps, written and read back over HTTP (ADR-0005). One file rather than assertions
// split between create-recipe.test.js and edit-delete-recipe.test.js: a Recipe's Steps are replaced
// whole on every write, so what a create does and what an edit does is one rule, and reading it in
// one place is what makes "the set is replaced" legible.
//
// Every rule asserted here lives in the schema module the Add and Edit forms also compile, so a
// refusal proven at this boundary is the refusal the form shows before it sends.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECIPE_STEPS_MAX, STEP_MAX } from '@meal-prep/shared';
import { startApp } from './helpers/app.js';
import { createRecipe, deleteRecipe, readRecipes, updateRecipe } from './helpers/recipes.js';

const stew = {
  name: 'Beef Stew',
  type: 'Stew',
  ingredients: [{ name: 'Beef shin', quantity: 500, unit: 'g' }],
  steps: ['Brown the beef in batches.', 'Add carrots and stock, simmer two hours.'],
};

const refuseCreate = async (app, payload) => {
  const response = await app.inject({ method: 'POST', url: '/api/recipes', payload });
  assert.equal(response.statusCode, 400, `expected a refusal, got ${response.statusCode}`);
  return response.json();
};

/** The Steps of the one Recipe the app is holding, as the state response gives them. */
async function readSteps(app) {
  const [recipe] = await readRecipes(app);
  return recipe.steps;
}

describe('writing a Recipe with Steps', () => {
  it('comes back from the create in the order it was written', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, stew);

    assert.deepEqual(created.steps, [
      'Brown the beef in batches.',
      'Add carrots and stock, simmer two hours.',
    ]);
  });

  it('is in the state response in that order too', async (t) => {
    const app = await startApp(t);

    await createRecipe(app, stew);

    assert.deepEqual(await readSteps(app), [
      'Brown the beef in batches.',
      'Add carrots and stock, simmer two hours.',
    ]);
  });

  // Steps are optional, so a Recipe that is a name and a Recipe Card is still a Recipe. It reads
  // back as an empty list rather than as a missing field, because a reader should not have to tell
  // "no Steps" from "this response does not mention Steps".
  it('reads back as no Steps at all when the write named none', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, {
      name: 'Toast',
      type: 'Breakfast',
      cardUrl: 'https://example.com/toast',
    });

    assert.deepEqual(created.steps, []);
    assert.deepEqual(await readSteps(app), []);
  });

  it('trims a Step rather than storing the whitespace around it', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, { ...stew, steps: ['  Brown the beef.  '] });

    assert.deepEqual(created.steps, ['Brown the beef.']);
  });
});

describe('rewriting the Steps of a Recipe', () => {
  it('replaces the whole set rather than adding to it', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, stew);

    const edited = await updateRecipe(app, created.id, {
      ...stew,
      steps: ['Season the beef.', 'Brown it.', 'Simmer two hours.'],
    });

    assert.deepEqual(edited.steps, ['Season the beef.', 'Brown it.', 'Simmer two hours.']);
    assert.deepEqual(await readSteps(app), [
      'Season the beef.',
      'Brown it.',
      'Simmer two hours.',
    ]);
  });

  it('reorders them when that is all the edit changed', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, stew);

    const edited = await updateRecipe(app, created.id, {
      ...stew,
      steps: [...stew.steps].reverse(),
    });

    assert.deepEqual(edited.steps, [
      'Add carrots and stock, simmer two hours.',
      'Brown the beef in batches.',
    ]);
  });

  it('clears them when the edit sends an empty list', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, stew);

    const edited = await updateRecipe(app, created.id, { ...stew, steps: [] });

    assert.deepEqual(edited.steps, []);
    assert.deepEqual(await readSteps(app), []);
  });

  // The Steps of one Recipe are its own. A rewrite deletes by Recipe id, and a statement missing
  // that condition would empty the other Recipe's list without anything on screen saying so.
  it('leaves the Steps of every other Recipe alone', async (t) => {
    const app = await startApp(t);
    const kept = await createRecipe(app, { ...stew, name: 'Beef Stew Two' });
    const rewritten = await createRecipe(app, stew);

    await updateRecipe(app, rewritten.id, { ...stew, steps: ['Something else entirely.'] });

    const recipes = await readRecipes(app);
    const after = recipes.find((recipe) => recipe.id === kept.id);
    assert.deepEqual(after.steps, stew.steps);
  });
});

describe('refusing a Step the schema does not allow', () => {
  it('refuses one longer than the cap', async (t) => {
    const app = await startApp(t);

    await refuseCreate(app, { ...stew, steps: ['x'.repeat(STEP_MAX + 1)] });

    assert.deepEqual(await readRecipes(app), []);
  });

  it('accepts one exactly at the cap', async (t) => {
    const app = await startApp(t);

    const created = await createRecipe(app, { ...stew, steps: ['x'.repeat(STEP_MAX)] });

    assert.equal(created.steps[0].length, STEP_MAX);
  });

  // The form drops its blank rows before it sends, so a blank arriving here came from something
  // else, and it is a caller sending nothing and calling it an instruction.
  it('refuses an empty Step', async (t) => {
    const app = await startApp(t);

    await refuseCreate(app, { ...stew, steps: ['Brown the beef.', ''] });

    assert.deepEqual(await readRecipes(app), []);
  });

  it('refuses a Step of nothing but spaces', async (t) => {
    const app = await startApp(t);

    await refuseCreate(app, { ...stew, steps: ['   '] });
  });

  it('refuses more Steps than a Recipe may hold', async (t) => {
    const app = await startApp(t);
    const steps = Array.from({ length: RECIPE_STEPS_MAX + 1 }, (_, i) => `Step ${i + 1}.`);

    await refuseCreate(app, { ...stew, steps });
  });

  // An edit is held to the same schema as a create, so a Recipe a cook may not add is not one they
  // may edit their way into.
  it('refuses an over-long Step on an edit, leaving the Steps as they were', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, stew);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${created.id}`,
      payload: { ...stew, steps: ['x'.repeat(STEP_MAX + 1)] },
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.deepEqual(await readSteps(app), stew.steps);
  });
});

// Asserted through the Recipe's absence and through the delete being accepted at all: the Steps of
// a deleted Recipe have no endpoint left to read them, and a foreign key that did not cascade would
// refuse the delete rather than leave them behind quietly.
describe('deleting a Recipe with Steps', () => {
  it('takes the Recipe and its Steps with it', async (t) => {
    const app = await startApp(t);
    const created = await createRecipe(app, stew);

    await deleteRecipe(app, created.id);

    assert.deepEqual(await readRecipes(app), []);
  });
});
