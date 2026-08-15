// Emptying the database and loading the Seed back into it.
//
// Every Recipe goes in as an HTTP request against this same API, through Fastify's inject rather
// than a socket. That is what makes the Seed proof that the guardrails accept legitimate data: the
// fixture meets the shared schema, the repeated-Ingredient check, the Ingredient identity upsert and
// the row caps, all of them the deployment's own, and a fixture the API would refuse over HTTP
// refuses to load. Writing the rows directly would have been a second write path to keep in step
// with the first.
//
// Nothing here knows which Variant it is (ADR-0002). It is a command an operator schedules against
// the deployment they mean to restore, and the Homelab Variant simply never schedules it.

import { buildApp } from './app.js';
import { SEED } from './seedFixture.js';

// Everything except the migration bookkeeping, discovered rather than listed: a table a later
// migration adds is part of what a restore has to clear, and a list here would leave it behind and
// call the result the Seed. `restart identity` is what makes a restored database identical to the
// last one rather than one whose ids climb with every restore.
const DOMAIN_TABLES = `
  select quote_ident(tablename) as ident
  from pg_tables
  where schemaname = 'public' and tablename <> 'schema_migrations'
`;

// The one write with no endpoint behind it. Protected is what stops the next visitor finding the
// demo edited into nonsense, so no request may set it, which leaves the loader to set it directly
// on the rows it has just created.
const PROTECT_SEEDED_RECIPES = 'update recipes set protected = true';

/**
 * Empties every domain table, leaving the migration record alone. Exported because the test fixture
 * clears the database between tests and there is one right answer to "what counts as a domain
 * table": a second copy would let the suite and the restore disagree about what a clean database is.
 *
 * Takes a pool or a client, and must be connected as the owner role.
 */
export async function emptyDatabase(db) {
  const { rows } = await db.query(DOMAIN_TABLES);
  if (rows.length === 0) return;

  const tables = rows.map((row) => row.ident).join(', ');
  await db.query(`truncate table ${tables} restart identity cascade`);
}

/**
 * Sends one request and refuses to carry on if the API did not accept it. The Seed is the data this
 * app is demonstrated with, so a fixture the API argues with is a bug in the fixture and the restore
 * has to stop and say which entry caused it.
 */
async function send(app, { method, url, payload, expected, entry }) {
  const response = await app.inject({ method, url, payload });
  if (response.statusCode !== expected) {
    throw new Error(`the Seed's ${entry} was refused with ${response.statusCode}: ${response.body}`);
  }
  return response;
}

/**
 * The id the API minted for each food the Recipes named. Read once, before anything is marked a
 * Staple, because a Staple leaves the Pantry checklist the moment it becomes one.
 */
async function ingredientIds(app) {
  const { pantryChecklist } = (await send(app, {
    method: 'GET',
    url: '/api/state',
    expected: 200,
    entry: 'Ingredients',
  })).json();

  return new Map(pantryChecklist.map((ingredient) => [ingredient.name, ingredient.id]));
}

/** The id a fixture entry names, or a refusal saying which entry names a food no Recipe uses. */
function idFor(ids, name, role) {
  const id = ids.get(name);
  if (!id) throw new Error(`the Seed gives ${name} ${role}, but no seeded Recipe calls for it`);
  return id;
}

/**
 * Empties the database and loads the Seed into it, leaving exactly the fixture however dirty the
 * database was to start with.
 *
 * The pool must be connected as the owner role: the restricted role the API runs as deliberately
 * holds no TRUNCATE grant, which is the point of the grant it does hold.
 */
export async function restoreSeed({ pool, guardrails, fixture = SEED, log = () => {} }) {
  await emptyDatabase(pool);
  log('emptied every table but the migration record');

  const app = await buildApp({ pool, logger: false, guardrails });
  try {
    const recipeIds = new Map();
    for (const recipe of fixture.recipes) {
      const created = await send(app, {
        method: 'POST',
        url: '/api/recipes',
        payload: recipe,
        expected: 201,
        entry: recipe.name,
      });
      recipeIds.set(recipe.name, created.json().id);
    }
    log(`loaded ${fixture.recipes.length} Recipes`);

    // Before a Staple is marked, because marking one takes it off the Pantry checklist this reads.
    const ids = await ingredientIds(app);

    // An Aisle only becomes visible once something puts the Ingredient on a Shopping List, so a food
    // the fixture forgot to shelve would go unnoticed until a visitor selected the one Recipe
    // calling for it. Asked here, where the answer is a refusal rather than a gap in the demo.
    const unshelved = [...ids.keys()].filter((name) => !fixture.aisles[name]);
    if (unshelved.length > 0) {
      throw new Error(`the Seed gives no Aisle to ${unshelved.join(', ')}`);
    }

    for (const name of fixture.staples) {
      await send(app, {
        method: 'PUT',
        url: `/api/ingredients/${idFor(ids, name, 'as a Staple')}/staple`,
        payload: { staple: true },
        expected: 204,
        entry: `Staple ${name}`,
      });
    }
    log(`marked ${fixture.staples.length} Staples`);

    for (const [name, aisle] of Object.entries(fixture.aisles)) {
      await send(app, {
        method: 'PUT',
        url: `/api/ingredients/${idFor(ids, name, 'an Aisle')}/aisle`,
        payload: { aisle },
        expected: 204,
        entry: `Aisle for ${name}`,
      });
    }

    for (const name of fixture.selected) {
      const id = recipeIds.get(name);
      if (!id) throw new Error(`the Seed selects ${name}, which is not one of its Recipes`);
      await send(app, {
        method: 'PUT',
        url: `/api/recipes/${id}/selected`,
        payload: { selected: true },
        expected: 204,
        entry: `Selected Recipe ${name}`,
      });
    }
    log(`put ${fixture.selected.length} Recipes on the Shopping List`);

    // Last, and after every request above rather than beside the inserts. Only the edit and the
    // delete consult the flag today, so setting it earlier would work by luck: the loader would be
    // relying on which routes happen not to check it.
    await pool.query(PROTECT_SEEDED_RECIPES);
    log('marked every seeded Recipe Protected');

    return {
      recipes: fixture.recipes.length,
      ingredients: ids.size,
      staples: fixture.staples.length,
    };
  } finally {
    await app.close();
  }
}
