// Aisles as a managed, ordered list: the sections of the store in the order the cook walks them.
//
// Distinct from aisle.test.js, which is filing one Ingredient into one of these rows by reference.
// What that file assumes and this one proves is the delete case it depends on: removing an Aisle
// unassigns rather than refuses (spec story 16).
//
// Every assertion reads the state response rather than the table, because position is the API's to
// maintain and a client never sends one: the only honest question to ask is what order the next
// read comes back in.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AISLE_MAX } from '@meal-prep/shared';
import {
  addAisle,
  deleteAisle,
  listAisles,
  aisleNames,
  postAisle,
  putAisleName,
  putAisleOrder,
  readAisles,
  removeAisle,
  renameAisle,
  reorderAisles,
} from './helpers/aisles.js';
import { startApp } from './helpers/app.js';
import { createRecipe, readShoppingList, setSelected } from './helpers/recipes.js';
import { setAisle } from './helpers/shopping.js';

describe('adding an Aisle', () => {
  it('puts it on the list the state response carries', async (t) => {
    const app = await startApp(t);

    const created = await addAisle(app, 'Produce');

    assert.equal(created.name, 'Produce');
    assert.deepEqual(await readAisles(app), [created]);
  });

  // The end rather than anywhere else, because a section the cook has just remembered is a section
  // they have not placed in the walk yet, and the reorder controls are how it gets placed.
  it('puts each new one at the end of the walk', async (t) => {
    const app = await startApp(t);

    await addAisle(app, 'Produce');
    await addAisle(app, 'Bakery');
    await addAisle(app, 'Frozen');

    assert.deepEqual(await aisleNames(app), ['Produce', 'Bakery', 'Frozen']);
  });

  // Trimmed the way an Ingredient name is, so one section of the store does not arrive as two
  // because of a space the cook could not see.
  it('trims what the cook typed', async (t) => {
    const app = await startApp(t);

    const created = await addAisle(app, '  Produce  ');

    assert.equal(created.name, 'Produce');
    assert.deepEqual(await aisleNames(app), ['Produce']);
  });

  it('refuses a name that is nothing but spaces', async (t) => {
    const app = await startApp(t);

    const response = await postAisle(app, '   ');

    assert.equal(response.statusCode, 400);
    assert.deepEqual(await aisleNames(app), []);
  });

  it('keeps the punctuation a store section is actually written with', async (t) => {
    const app = await startApp(t);

    const created = await addAisle(app, 'Aisle 12 - Dairy & eggs');

    assert.equal(created.name, 'Aisle 12 - Dairy & eggs');
  });

  it('refuses a name longer than the free-text Aisle was allowed', async (t) => {
    const app = await startApp(t);

    const response = await postAisle(app, 'A'.repeat(AISLE_MAX + 1));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(await aisleNames(app), []);
  });

  it('accepts a name exactly at the cap', async (t) => {
    const app = await startApp(t);
    const longest = 'A'.repeat(AISLE_MAX);

    await addAisle(app, longest);

    assert.deepEqual(await aisleNames(app), [longest]);
  });

  // The whole reason Aisle stopped being free text: the picker this list feeds must never offer one
  // section of the store twice, however the second spelling was capitalized.
  it('refuses a name another Aisle already has, whatever its case', async (t) => {
    const app = await startApp(t);
    await addAisle(app, 'Produce');

    const response = await postAisle(app, ' produce ');

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().message, 'There is already an Aisle called Produce.');
    assert.deepEqual(await aisleNames(app), ['Produce']);
  });
});

describe('renaming an Aisle', () => {
  it('fixes the name without moving it in the walk', async (t) => {
    const app = await startApp(t);
    await addAisle(app, 'Produce');
    const middle = await addAisle(app, 'Bakery');
    await addAisle(app, 'Frozen');

    const renamed = await renameAisle(app, middle.id, 'Bread & bakery');

    assert.equal(renamed.id, middle.id);
    assert.deepEqual(await aisleNames(app), ['Produce', 'Bread & bakery', 'Frozen']);
  });

  // Nothing an Ingredient holds names an Aisle by its text, so this is the whole of the story
  // story 13 asks for: fixing a name is not reassigning what is filed under it.
  it('trims what the cook typed', async (t) => {
    const app = await startApp(t);
    const aisle = await addAisle(app, 'Produce');

    const renamed = await renameAisle(app, aisle.id, '  Fruit & veg  ');

    assert.equal(renamed.name, 'Fruit & veg');
  });

  it('refuses a name another Aisle already has, whatever its case', async (t) => {
    const app = await startApp(t);
    await addAisle(app, 'Produce');
    const bakery = await addAisle(app, 'Bakery');

    const response = await putAisleName(app, bakery.id, 'PRODUCE');

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().message, 'There is already an Aisle called Produce.');
    assert.deepEqual(await aisleNames(app), ['Produce', 'Bakery']);
  });

  // Capitalizing a name is a rename like any other, and the row it collides with is itself.
  it('lets an Aisle keep its own name in a different case', async (t) => {
    const app = await startApp(t);
    const aisle = await addAisle(app, 'produce');

    await renameAisle(app, aisle.id, 'Produce');

    assert.deepEqual(await aisleNames(app), ['Produce']);
  });

  it('refuses a name that is nothing but spaces', async (t) => {
    const app = await startApp(t);
    const aisle = await addAisle(app, 'Produce');

    const response = await putAisleName(app, aisle.id, '  ');

    assert.equal(response.statusCode, 400);
    assert.deepEqual(await aisleNames(app), ['Produce']);
  });

  it('refuses a name longer than the free-text Aisle was allowed', async (t) => {
    const app = await startApp(t);
    const aisle = await addAisle(app, 'Produce');

    const response = await putAisleName(app, aisle.id, 'A'.repeat(AISLE_MAX + 1));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(await aisleNames(app), ['Produce']);
  });

  it('refuses an Aisle that is not there, naming what it looked for', async (t) => {
    const app = await startApp(t);

    const response = await putAisleName(app, 'A999', 'Produce');

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, 'There is no Aisle A999.');
  });
});

describe('reordering the Aisles', () => {
  it('rewrites the walk the next state read comes back in', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    const bakery = await addAisle(app, 'Bakery');
    const frozen = await addAisle(app, 'Frozen');

    await reorderAisles(app, [frozen.id, produce.id, bakery.id]);

    assert.deepEqual(await aisleNames(app), ['Frozen', 'Produce', 'Bakery']);
  });

  // Every position, not the pair that moved: the request carries the whole walk, so what comes back
  // is the walk it carried however far each section travelled.
  it('takes a walk turned end to end', async (t) => {
    const app = await startApp(t);
    const names = ['Produce', 'Bakery', 'Frozen', 'Dairy', 'Drinks'];
    const created = [];
    for (const name of names) created.push(await addAisle(app, name));

    await reorderAisles(app, created.map((aisle) => aisle.id).reverse());

    assert.deepEqual(await aisleNames(app), [...names].reverse());
  });

  it('lands the same way twice, so a retry cannot overshoot', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    const bakery = await addAisle(app, 'Bakery');

    await reorderAisles(app, [bakery.id, produce.id]);
    await reorderAisles(app, [bakery.id, produce.id]);

    assert.deepEqual(await aisleNames(app), ['Bakery', 'Produce']);
  });

  // A partial list would leave the Aisles it left out with positions nobody chose, so it is refused
  // rather than half-applied. The cook's screen has gone stale, and a reload is the way back.
  it('refuses a list that leaves an Aisle out', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    await addAisle(app, 'Bakery');

    const response = await putAisleOrder(app, [produce.id]);

    assert.equal(response.statusCode, 409);
    assert.deepEqual(await aisleNames(app), ['Produce', 'Bakery']);
  });

  it('refuses a list naming one Aisle twice', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    await addAisle(app, 'Bakery');

    const response = await putAisleOrder(app, [produce.id, produce.id]);

    assert.equal(response.statusCode, 409);
    assert.deepEqual(await aisleNames(app), ['Produce', 'Bakery']);
  });

  it('refuses a list naming an Aisle that is not there', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');

    const response = await putAisleOrder(app, [produce.id, 'A999']);

    assert.equal(response.statusCode, 409);
    assert.deepEqual(await aisleNames(app), ['Produce']);
  });

  it('names the whole walk as what it wanted', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    await addAisle(app, 'Bakery');

    const response = await putAisleOrder(app, [produce.id]);

    assert.equal(
      response.json().message,
      'That is not the whole list of Aisles. Reload and try again.',
    );
  });
});

describe('removing an Aisle', () => {
  it('takes it off the walk', async (t) => {
    const app = await startApp(t);
    await addAisle(app, 'Produce');
    const bakery = await addAisle(app, 'Bakery');
    await addAisle(app, 'Frozen');

    await removeAisle(app, bakery.id);

    assert.deepEqual(await aisleNames(app), ['Produce', 'Frozen']);
  });

  // Positions close up behind a removal, so the section added next still lands at the end of the
  // walk rather than in the gap the removed one left.
  it('leaves the walk in one piece for whatever is added next', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    await addAisle(app, 'Bakery');
    await addAisle(app, 'Frozen');

    await removeAisle(app, produce.id);
    await addAisle(app, 'Drinks');

    assert.deepEqual(await aisleNames(app), ['Bakery', 'Frozen', 'Drinks']);
  });

  it('leaves a walk that can still be reordered whole', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    const bakery = await addAisle(app, 'Bakery');
    const frozen = await addAisle(app, 'Frozen');
    await removeAisle(app, bakery.id);

    await reorderAisles(app, [frozen.id, produce.id]);

    assert.deepEqual(await aisleNames(app), ['Frozen', 'Produce']);
  });

  // Removing frees the name as well as the place, so a section deleted by mistake can be added back
  // exactly as it was.
  it('frees the name it was holding', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    await removeAisle(app, produce.id);

    await addAisle(app, 'Produce');

    assert.deepEqual(await aisleNames(app), ['Produce']);
  });

  it('refuses an Aisle that is not there, naming what it looked for', async (t) => {
    const app = await startApp(t);

    const response = await deleteAisle(app, 'A999');

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, 'There is no Aisle A999.');
  });

  // The initial sort is being done with an agent, so a mistaken removal has to be cheap to recover
  // from: unassigning rather than refusing is what makes tidying the list never a blocked action.
  it('unassigns the Ingredients filed under it rather than being refused', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    const recipe = await createRecipe(app, {
      name: 'Minestrone',
      type: 'Soup',
      ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
    });
    await setSelected(app, recipe.id, true);
    const [{ ingredientId }] = await readShoppingList(app);
    await setAisle(app, ingredientId, produce.id);

    await removeAisle(app, produce.id);

    const [entry] = await readShoppingList(app);
    assert.equal(entry.aisleId, null);
  });
});

// A list of its own beside the one the state response carries, because the two answer different
// callers: the app reads the whole first paint in one request, and anything holding an Aisle id -
// the Seed loader that has just created these rows, an operator filing Ingredients with an agent -
// wants the sections and nothing else.
describe('listing the Aisles', () => {
  it('answers with the sections of the store in walk order', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    const bakery = await addAisle(app, 'Bakery');
    await reorderAisles(app, [bakery.id, produce.id]);

    const listed = await listAisles(app);

    assert.deepEqual(listed, [bakery, produce]);
  });

  it('answers with an empty list before any Aisle is added', async (t) => {
    const app = await startApp(t);

    assert.deepEqual(await listAisles(app), []);
  });

  it('says the same thing the state response says', async (t) => {
    const app = await startApp(t);
    await addAisle(app, 'Produce');
    await addAisle(app, 'Bakery');

    assert.deepEqual(await listAisles(app), await readAisles(app));
  });
});

// The absolute ceiling ADR-0001 asks of every table a visitor can write to. The number is written
// out here rather than imported from the module under test: an assertion that rebuilds the message
// the way the code builds it can never disagree with it.
describe('the ceiling on Aisles', () => {
  it('refuses one past the ceiling and says how many there is room for', async (t) => {
    const app = await startApp(t);
    for (let n = 1; n <= 100; n += 1) await addAisle(app, `Aisle ${n}`);

    const response = await postAisle(app, 'One too many');

    assert.equal(response.statusCode, 409);
    assert.equal(
      response.json().message,
      'This instance has room for 100 Aisles and is holding all of them.',
    );
    assert.equal((await readAisles(app)).length, 100);
  });
});

// Two phones share one instance, and the Settings page is one tap per section. Position is dense
// and the API's alone, so nothing a client sends can tell two sections apart when they arrive
// together: only this file can, and it has to.
describe('two cooks writing the walk at once', () => {
  it('gives every section added together a place of its own', async (t) => {
    const app = await startApp(t);
    const names = ['Produce', 'Bakery', 'Frozen', 'Dairy', 'Drinks', 'Tins', 'Baking', 'Household'];

    const responses = await Promise.all(names.map((name) => postAisle(app, name)));

    assert.deepEqual(
      responses.map((response) => response.statusCode),
      names.map(() => 201),
    );
    assert.deepEqual([...(await aisleNames(app))].sort(), [...names].sort());
  });

  it('leaves a walk that can still be reordered whole after a removal races an add', async (t) => {
    const app = await startApp(t);
    const produce = await addAisle(app, 'Produce');
    await addAisle(app, 'Bakery');

    await Promise.all([deleteAisle(app, produce.id), postAisle(app, 'Frozen')]);

    const remaining = await readAisles(app);
    await reorderAisles(app, remaining.map((aisle) => aisle.id).reverse());
    assert.deepEqual(
      await aisleNames(app),
      remaining.map((aisle) => aisle.name).reverse(),
    );
  });
});

