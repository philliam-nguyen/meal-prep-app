// The endpoint two phones ask every few seconds while they shop together. It has to move whenever
// anything the cook can see moved, and it has to cost almost nothing when nothing has.
//
// Two tests here reach past the HTTP seam ADR-0005 fixes, and both are deliberate.
//
// `recordQueries` counts the statements a request runs. "One cheap query" is a promise this endpoint
// makes to a client that asks for it every four seconds, and a response body cannot show whether it
// was answered by one query or six. The wrapper observes and passes through; nothing is stubbed, and
// the database stays real.
//
// The delete below is the file's one raw statement. There is no delete endpoint until ticket 09, and
// the version surviving a delete is the property that endpoint will depend on, so the alternative is
// shipping the claim untested. It goes when ticket 09 lands and the test can send a DELETE.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startApp } from './helpers/app.js';
import { connect } from './helpers/database.js';
import { ingredientIdIn, setPantry, setStaple } from './helpers/pantry.js';
import { createRecipe, setSelected } from './helpers/recipes.js';

const SOUP = {
  name: 'Minestrone',
  type: 'Soup',
  ingredients: [{ name: 'Onion', quantity: 2, unit: '' }],
};

async function readVersion(app) {
  const response = await app.inject({ method: 'GET', url: '/api/version' });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().version;
}

/**
 * Records the SQL a request runs. Reaches past the HTTP seam on purpose: "one cheap query" is a
 * promise this endpoint makes to a client that asks every few seconds, and there is nowhere else to
 * observe it.
 */
function recordQueries(t, app) {
  const pool = app.db;
  const original = pool.query;
  const sql = [];

  pool.query = function record(...args) {
    sql.push(args[0]);
    return original.apply(this, args);
  };
  // Removes the override rather than reassigning, so the pool goes back to its own method.
  t.after(() => delete pool.query);

  return sql;
}

/** Asserts that a write is one the polling client finds out about. */
async function assertAdvances(app, write) {
  const before = await readVersion(app);
  await write();
  assert.notEqual(await readVersion(app), before);
}

describe('the version endpoint', () => {
  it('holds steady while nothing is written', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, SOUP);

    const first = await readVersion(app);
    const second = await readVersion(app);

    assert.equal(second, first);
  });

  it('advances when a Recipe is added', async (t) => {
    const app = await startApp(t);

    await assertAdvances(app, () => createRecipe(app, SOUP));
  });

  it('advances when a Recipe is selected', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, SOUP);

    await assertAdvances(app, () => setSelected(app, recipe.id, true));
  });

  it('advances when an Ingredient goes into the Pantry', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, SOUP);
    const onion = ingredientIdIn(recipe, 'Onion');

    await assertAdvances(app, () => setPantry(app, onion, true));
  });

  it('advances when an Ingredient becomes a Staple', async (t) => {
    const app = await startApp(t);
    const recipe = await createRecipe(app, SOUP);
    const onion = ingredientIdIn(recipe, 'Onion');

    await assertAdvances(app, () => setStaple(app, onion, true));
  });

  // The one write shape a timestamp alone cannot see. Deleting a row that is not the most recently
  // touched one leaves the maximum where it was, so a version built only from that maximum would sit
  // still while a Recipe disappeared from under the other phone.
  //
  // Deleted here as the restricted role rather than through an endpoint, because the delete endpoint
  // arrives in ticket 09 and this is the property that endpoint will rely on.
  it('advances when a Recipe is deleted, even one that is not the newest', async (t) => {
    const app = await startApp(t);
    const older = await createRecipe(app, SOUP);
    await createRecipe(app, { name: 'Focaccia', type: 'Bread' });
    const db = await connect(t);

    await assertAdvances(app, () => db.query('delete from recipes where id = $1', [older.id]));
  });

  it('costs one query and a body a phone can ask for all afternoon', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, SOUP);
    const sql = recordQueries(t, app);

    const response = await app.inject({ method: 'GET', url: '/api/version' });

    assert.equal(sql.length, 1);
    assert.ok(Buffer.byteLength(response.body) < 100, `${response.body} is not a small body`);
  });
});

describe('the version the first paint arrives with', () => {
  it('is the one the poll can start comparing against', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, SOUP);

    const response = await app.inject({ method: 'GET', url: '/api/state' });

    assert.equal(response.json().version, await readVersion(app));
  });

  // The version is read before the payload's own queries, never alongside them. A write landing in
  // between then makes the payload newer than the version it carries, which costs the client one
  // refetch it did not need. The other order costs it the write, permanently, which is the bug this
  // whole endpoint exists to prevent.
  it('is never newer than the payload it arrives with', async (t) => {
    const app = await startApp(t);
    const sql = recordQueries(t, app);
    // Lands between the version read and the payload's queries, in the window the ordering exists
    // to make safe. Sent through the API like any other write, and the guard is what keeps its own
    // queries from arriving here and starting a second one.
    const writeAfterTheVersionIsRead = async () => {
      if (sql.length !== 1) return;
      await createRecipe(app, { name: 'Focaccia', type: 'Bread' });
    };
    const pool = app.db;
    const record = pool.query;
    pool.query = async function interleave(...args) {
      const result = await record.apply(this, args);
      await writeAfterTheVersionIsRead();
      return result;
    };

    const response = await app.inject({ method: 'GET', url: '/api/state' });

    const state = response.json();
    assert.deepEqual(
      state.recipes.map((recipe) => recipe.name),
      ['Focaccia'],
      'the payload should have been read after the write',
    );
    assert.notEqual(state.version, await readVersion(app));
  });
});
