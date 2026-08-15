// The Seed, and the restore that puts it back. A Demo Visitor lands on a populated app and gets
// something worth looking at out of their first gesture, and whatever they leave behind is gone by
// the next scheduled restore.
//
// The loader is driven here as the scheduled task drives it. Every assertion about what it wrote is
// an HTTP response, so nothing here knows how a Recipe reaches the database (ADR-0005).

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { RECIPE_TYPES } from '@meal-prep/shared';
import { startApp } from './helpers/app.js';
import { ownerDatabaseUrl } from './helpers/database.js';
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
import { loadSeed } from './helpers/seed.js';
import { setAisle, setGotIt } from './helpers/shopping.js';

/** A Recipe the API returned, in the shape a request rewriting it has to send. */
const asPayload = (recipe) => ({
  name: recipe.name,
  type: recipe.type,
  cardUrl: recipe.cardUrl,
  ingredients: recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
});

const refuseEdit = async (app, recipe, payload) => {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/recipes/${recipe.id}`,
    payload,
  });
  assert.equal(response.statusCode, 403, response.body);
  return response.json();
};

const refuseDelete = async (app, recipe) => {
  const response = await app.inject({ method: 'DELETE', url: `/api/recipes/${recipe.id}` });
  assert.equal(response.statusCode, 403, response.body);
  return response.json();
};

/**
 * The first-paint payload without the freshness mark. The version moves with every write by design,
 * so two restores of the same fixture are meant to differ in it and in nothing else.
 */
async function stateWithoutVersion(app) {
  const { version, ...rest } = await readState(app);
  return rest;
}

/** Ticks Ingredients into the Pantry by name, the way a visitor reads the checklist. */
async function tickPantry(app, names) {
  const { pantryChecklist } = await readState(app);
  for (const name of names) {
    const entry = pantryChecklist.find((ingredient) => ingredient.name === name);
    assert.ok(entry, `the Seed has no Ingredient called ${name} to tick`);
    await setPantry(app, entry.id, true);
  }
}

describe('the Seed', () => {
  it('covers the Recipe Type range', async (t) => {
    const app = await startApp(t);

    await loadSeed(t);

    const seeded = new Set((await readRecipes(app)).map((recipe) => recipe.type));
    assert.deepEqual([...seeded].sort(), [...RECIPE_TYPES].sort());
  });

  // The visitor's first gesture, and the whole reason the fixture is written by hand: five ticks
  // have to rank a good part of the collection, or Best Matches demonstrates nothing.
  it('ranks a good part of the collection off a handful of Pantry ticks', async (t) => {
    const app = await startApp(t);
    await loadSeed(t);
    const ticked = ['Onion', 'Garlic', 'Carrot', 'Potato', 'Chicken stock'];
    await tickPantry(app, ticked);

    const { bestMatches, staples } = await readState(app);

    assert.ok(bestMatches.length >= 8, `a handful of ticks ranked only ${bestMatches.length}`);
    const missingCounts = bestMatches.map((match) => match.missing.length);
    assert.deepEqual(missingCounts, [...missingCounts].sort((a, b) => a - b));
    assert.ok(new Set(missingCounts).size >= 3, 'every Best Match is short of the same amount');

    // What the ranking must never say a visitor is short of: something they have just ticked, or a
    // Staple. The Staple half is why the fixture names any, so an empty list would pass vacuously.
    const missing = new Set(bestMatches.flatMap((match) => match.missing));
    assert.ok(staples.length > 0, 'the Seed marked no Staples');
    for (const name of [...ticked, ...staples.map((staple) => staple.name)]) {
      assert.ok(!missing.has(name), `${name} is counted Missing`);
    }
  });

  // A visitor should not have to select a Recipe before the Shopping List has anything to show. The
  // amount is the worked example: the Pie calls for 300g of leek and the Soup for 400g, and one
  // entry saying 700g is the consolidation this feature exists for.
  it('lands a visitor on a populated Shopping List, sorted into store sections', async (t) => {
    const app = await startApp(t);

    await loadSeed(t);

    const shoppingList = await readShoppingList(app);
    assert.ok(shoppingList.length > 0, 'the Seed put nothing on the Shopping List');
    for (const entry of shoppingList) {
      assert.ok(entry.aisle, `${entry.name} is on the list with no Aisle`);
    }
    const leek = shoppingList.find((entry) => entry.name === 'Leek');
    assert.deepEqual(leek?.amounts, [{ quantity: 700, unit: 'g' }]);
  });

  // The other thing loading through the API buys: every Recipe above got here by meeting the rules
  // a visitor's own Recipe meets, so the Seed is standing proof that the guardrails accept
  // legitimate data. This is that claim from the other side. A `http:` Recipe Card is the rule
  // ticket 05 wrote against stored XSS, and no separate check in this loader knows about it.
  it('refuses a fixture the API would refuse over HTTP', async (t) => {
    const app = await startApp(t);
    const refused = {
      recipes: [
        {
          name: 'Insecure Card',
          type: 'Snack',
          cardUrl: 'http://recipes.example.com/insecure',
          ingredients: [{ name: 'Apple', quantity: 1, unit: '' }],
        },
      ],
      staples: [],
      aisles: {},
      selected: [],
    };

    await assert.rejects(() => loadSeed(t, { fixture: refused }), /Insecure Card/);

    assert.deepEqual(await readRecipes(app), []);
  });

  // An Aisle is only visible once something puts the Ingredient on the Shopping List, so a food the
  // fixture forgot to shelve would sit there unnoticed until a visitor selected the one Recipe that
  // calls for it. The loader asks the question at load time instead.
  it('refuses a fixture that leaves an Ingredient unshelved', async (t) => {
    await startApp(t);
    const refused = {
      recipes: [
        {
          name: 'Unshelved',
          type: 'Snack',
          cardUrl: null,
          ingredients: [{ name: 'Apple', quantity: 1, unit: '' }],
        },
      ],
      staples: [],
      aisles: {},
      selected: [],
    };

    await assert.rejects(() => loadSeed(t, { fixture: refused }), /Apple/);
  });
});

// Only ever set in the Demo Variant, so everything here describes behaviour the Homelab Variant
// never reaches: it seeds nothing, so it has no Protected row to refuse (ADR-0002). Ticket 09 built
// the refusal; what these assert is that the Seed is what turns it on.
describe('a seeded Recipe', () => {
  const seeded = async (t) => {
    const app = await startApp(t);
    await loadSeed(t);
    const [recipe] = await readRecipes(app);
    return { app, recipe };
  };

  it('reports itself Protected', async (t) => {
    const { app } = await seeded(t);

    const recipes = await readRecipes(app);

    assert.ok(recipes.length > 0, 'the Seed loaded no Recipes');
    assert.deepEqual(
      recipes.filter((recipe) => !recipe.protected),
      [],
    );
  });

  it('refuses an edit, and says which Recipe refused it', async (t) => {
    const { app, recipe } = await seeded(t);

    const refusal = await refuseEdit(app, recipe, { ...asPayload(recipe), name: 'Anything' });

    assert.match(refusal.message, new RegExp(recipe.name));
  });

  it('is unchanged after a refused edit', async (t) => {
    const { app, recipe } = await seeded(t);

    await refuseEdit(app, recipe, { ...asPayload(recipe), name: 'Anything', ingredients: [] });

    const [after] = await readRecipes(app);
    assert.deepEqual(after, recipe);
  });

  it('refuses a delete, and says which Recipe refused it', async (t) => {
    const { app, recipe } = await seeded(t);

    const refusal = await refuseDelete(app, recipe);

    assert.match(refusal.message, new RegExp(recipe.name));
  });

  it('is still there after a refused delete', async (t) => {
    const { app, recipe } = await seeded(t);
    const before = (await readRecipes(app)).length;

    await refuseDelete(app, recipe);

    const after = await readRecipes(app);
    assert.equal(after.length, before);
    assert.equal(after[0].id, recipe.id);
  });

  // Putting a Recipe on the Shopping List is not editing it. A Demo Visitor has to be able to shop
  // for a seeded Recipe, or the demo is a read-only tour of the one thing the app is for.
  it('is still a Recipe a Demo Visitor can shop for', async (t) => {
    const { app, recipe } = await seeded(t);

    await setSelected(app, recipe.id, true);

    const shoppingList = await readShoppingList(app);
    for (const ingredient of recipe.ingredients) {
      assert.ok(
        shoppingList.some((entry) => entry.name === ingredient.name),
        `${ingredient.name} is missing from the Shopping List`,
      );
    }
  });

  // The other half of the flag meaning anything: a visitor's own Recipe sits beside the Seed and
  // takes an edit and a delete, so the refusals above are the flag rather than the endpoint.
  it('does not stop a Demo Visitor editing and deleting a Recipe they added', async (t) => {
    const { app } = await seeded(t);
    const mine = await createRecipe(app, {
      name: 'A Visitor Recipe',
      type: 'Snack',
      ingredients: [{ name: 'Apple', quantity: 1, unit: '' }],
    });

    const edited = await updateRecipe(app, mine.id, { name: 'Renamed', type: 'Snack' });

    assert.equal(edited.name, 'Renamed');
    await deleteRecipe(app, mine.id);
  });
});

// What the scheduled task is for: whatever a visitor left behind is gone by the next restore, and
// what is there afterwards is the fixture and nothing else. Ids included, because `restart identity`
// is what keeps a demo restored a hundred times from drifting away from the one restored once.
describe('the restore', () => {
  it('leaves exactly the Seed over a database a visitor has been at', async (t) => {
    const app = await startApp(t);
    await loadSeed(t);
    const fresh = await stateWithoutVersion(app);

    const mine = await createRecipe(app, {
      name: 'Visitor Leftovers',
      type: 'Snack',
      ingredients: [{ name: 'Crisps', quantity: 1, unit: 'bag' }],
    });
    await setSelected(app, mine.id, true);
    await tickPantry(app, ['Onion', 'Leek']);
    const [entry] = await readShoppingList(app);
    await setGotIt(app, entry.ingredientId, true);
    await setAisle(app, entry.ingredientId, 'Wherever');
    assert.notDeepEqual(await stateWithoutVersion(app), fresh);

    await loadSeed(t);

    assert.deepEqual(await stateWithoutVersion(app), fresh);
  });
});

// No second artifact and no separate database client: the scheduled task is the API's own image
// with this in place of the server command, the way the migration step already is.
describe('the restore command', () => {
  // The container runs `node packages/api/src/seed.js` from a WORKDIR holding the repository root,
  // so running this path from the repository root is that command less the container.
  const ENTRYPOINT = 'packages/api/src/seed.js';
  const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

  /** Only what a container has, so a variable the command needs and nobody sets fails here. */
  const containerEnvironment = (extra) =>
    Object.fromEntries(
      Object.entries({
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        ...extra,
      }).filter(([, value]) => value !== undefined),
    );

  const runRestore = () =>
    promisify(execFile)(process.execPath, [ENTRYPOINT], {
      cwd: repositoryRoot,
      env: containerEnvironment({ SEED_DATABASE_URL: ownerDatabaseUrl() }),
    });

  it('restores a database with one variable set and nothing else', async (t) => {
    const app = await startApp(t);

    const { stdout } = await runRestore();

    const recipes = await readRecipes(app);
    assert.ok(recipes.length > 0, `the command wrote no Recipes. It said: ${stdout}`);
    assert.deepEqual(
      recipes.filter((recipe) => !recipe.protected),
      [],
    );
  });

  it('says what it did, because nobody is watching when it runs', async (t) => {
    const app = await startApp(t);

    const { stdout } = await runRestore();

    const recipes = await readRecipes(app);
    assert.match(stdout, new RegExp(`${recipes.length} Recipes`));
  });

  // Nothing here runs the built image: that waits on ticket 13. What this can catch is the way the
  // command stops being in the image at all, which is somebody moving the entrypoint out of the
  // directory the runtime stage copies, or adding a .dockerignore line that drops it on the way in.
  // Both ship an image whose scheduled task fails, and neither shows up anywhere else in the suite.
  it('names a file the runtime stage copies and nothing excludes', async () => {
    const dockerfile = await readFile(new URL('../../../Dockerfile', import.meta.url), 'utf8');
    const dockerignore = await readFile(new URL('../../../.dockerignore', import.meta.url), 'utf8');
    const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf('FROM '));

    assert.ok(ENTRYPOINT.startsWith('packages/api/'), `${ENTRYPOINT} is outside packages/api`);
    assert.match(runtimeStage, /^COPY packages\/api packages\/api\b/m);
    assert.deepEqual(
      dockerignore.split('\n').filter((line) => line.trim().startsWith('packages')),
      [],
    );
  });
});
