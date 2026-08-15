// The endpoint two phones ask every few seconds while they shop together. It has to move whenever
// anything the cook can see moved, and it has to cost almost nothing when nothing has.
//
// Three tests here reach past the HTTP seam ADR-0005 fixes, all three deliberately, and one of them
// does more than watch.
//
// `interposeOnQueries` records the statements a request runs. "One cheap query" is a promise this
// endpoint makes to a client that asks for it every four seconds, and a response body cannot show
// whether one query answered it or six. Nothing is stubbed and the database stays real.
//
// The same helper is what `is never newer than the payload it arrives with` uses to land a write
// inside a live request. That one interposes rather than observes, which is the strongest reach in
// this file, and it is the only way to prove an ordering that exists precisely so that a write
// arriving mid-request cannot be lost. The write it lands goes through the API like any other.
//
// `deleteRecipeDirectly` is the file's one raw statement. Ticket 09 owns the delete endpoint, so
// until it lands there is no API to arrange this through, and the alternative is shipping untested
// the property that endpoint will depend on. Its one call site becomes a DELETE request when 09
// lands, and this helper goes.

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

async function askVersion(app) {
  const response = await app.inject({ method: 'GET', url: '/api/version' });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().version;
}

/**
 * Records every statement the pool runs for the life of one test, and runs `between` after each one.
 * Returns the running list, which `between` is handed so it can act on a particular statement.
 *
 * The one place this file reaches past the HTTP seam, and both of its uses are explained in the
 * header.
 */
function interposeOnQueries(t, app, between = async () => {}) {
  const pool = app.db;
  const original = pool.query;
  const sql = [];

  pool.query = async function interposed(...args) {
    sql.push(args[0]);
    const result = await original.apply(this, args);
    await between(sql);
    return result;
  };
  // Removes the override rather than reassigning, so the pool goes back to its own method.
  t.after(() => delete pool.query);

  return sql;
}

/**
 * Deletes a Recipe as the restricted role, which is the file's one raw statement. See the header:
 * this goes when ticket 09 ships an endpoint to send instead.
 */
const deleteRecipeDirectly = (db, recipeId) =>
  db.query('delete from recipes where id = $1', [recipeId]);

/** Asserts that a write is one the polling client finds out about. */
async function assertAdvances(app, write) {
  const before = await askVersion(app);
  await write();
  assert.notEqual(await askVersion(app), before);
}

describe('the version endpoint', () => {
  it('holds steady while nothing is written', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, SOUP);

    const first = await askVersion(app);
    const second = await askVersion(app);

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
  it('advances when a Recipe is deleted, even one that is not the newest', async (t) => {
    const app = await startApp(t);
    const older = await createRecipe(app, SOUP);
    await createRecipe(app, { name: 'Focaccia', type: 'Bread' });
    const db = await connect(t);

    await assertAdvances(app, () => deleteRecipeDirectly(db, older.id));
  });

  it('costs one query and a body a phone can ask for all afternoon', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, SOUP);
    const sql = interposeOnQueries(t, app);

    const response = await app.inject({ method: 'GET', url: '/api/version' });

    assert.equal(sql.length, 1);
    assert.ok(Buffer.byteLength(response.body) < 100, `${response.body} is not a small body`);
  });

  // Freshness is the one thing a cache cannot be allowed to help with. A poll answered from a
  // browser's heuristic cache or from the Demo Variant's CDN reports "nothing has changed" for as
  // long as that copy lives, and it reports it silently.
  it('refuses a cache, and so does the payload a moved version sends the client back for', async (t) => {
    const app = await startApp(t);

    const version = await app.inject({ method: 'GET', url: '/api/version' });
    const state = await app.inject({ method: 'GET', url: '/api/state' });

    assert.equal(version.headers['cache-control'], 'no-store');
    assert.equal(state.headers['cache-control'], 'no-store');
  });
});

describe('the version the first paint arrives with', () => {
  it('is the one the poll can start comparing against', async (t) => {
    const app = await startApp(t);
    await createRecipe(app, SOUP);

    const response = await app.inject({ method: 'GET', url: '/api/state' });

    assert.equal(response.json().version, await askVersion(app));
  });

  // The version is read before the payload's own queries, never alongside them. A write landing in
  // between then makes the payload newer than the version it carries, which costs the client one
  // refetch it did not need. The other order costs it the write, permanently, which is the bug this
  // whole endpoint exists to prevent.
  it('is never newer than the payload it arrives with', async (t) => {
    const app = await startApp(t);
    // Lands after the version read and before the payload's queries, which is the window the
    // ordering exists to make safe. It goes through the API like any other write, and the guard is
    // what stops its own statements arriving back here and starting a second one.
    interposeOnQueries(t, app, async (sql) => {
      if (sql.length !== 1) return;
      await createRecipe(app, { name: 'Focaccia', type: 'Bread' });
    });

    const response = await app.inject({ method: 'GET', url: '/api/state' });

    const state = response.json();
    assert.deepEqual(
      state.recipes.map((recipe) => recipe.name),
      ['Focaccia'],
      'the payload should have been read after the write',
    );
    assert.notEqual(state.version, await askVersion(app));
  });
});
