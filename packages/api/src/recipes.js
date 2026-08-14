// Writing a Recipe, and marking one as a Selected Recipe. The rules for the Recipe a cook types live
// in the shared schema module, which Fastify enforces here and the Add form compiles in the browser,
// so there is no server copy to drift from a client copy (ADR-0005). What is left in this file is
// the part JSON Schema cannot state: that two Recipe Ingredients in one request must not name the
// same food.
//
// The Selected Recipe route validates against a schema declared here instead, because no form
// compiles it: a checkbox has nothing to validate before it sends, so shared would gain a rule with
// one importer.
//
// Every statement is parameterized. Nothing on this path builds SQL from a string.

import { RECIPE_ID_MAX, createRecipeBody } from '@meal-prep/shared';
import { readRecipe, recipeSchema } from './state.js';

const INSERT_RECIPE = `
  insert into recipes (name, type, card_url)
  values ($1, $2, $3)
  returning id
`;

// Naming a food an existing Recipe already uses attaches to that Ingredient rather than creating a
// second row, which is what keeps Aisle and Pantry state in one place. The no-op update earns its
// place: "on conflict do nothing" returns no row, so the id would need a second round trip.
const UPSERT_INGREDIENT = `
  insert into ingredients (name)
  values ($1)
  on conflict (lower(btrim(name))) do update set name = ingredients.name
  returning id
`;

const INSERT_RECIPE_INGREDIENT = `
  insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
  values ($1, $2, $3, $4)
`;

// No "returning", because the row count already answers the only question the handler asks: whether
// a Recipe by that id was there to update.
const SET_SELECTED = `
  update recipes set selected = $2 where id = $1
`;

// The absolute ceiling on total Recipes (ADR-0001). Counting and then inserting is only an
// approximate cap: two creates arriving together both read a count below the ceiling and both
// insert. Taking a lock first is what makes it exact. The lock is released when the transaction
// ends, and it is advisory rather than a lock on the table, so it serializes creating a Recipe
// without standing in the way of any other write to one. Creating a Recipe is a rare, human-paced
// write, so serializing it costs nothing worth measuring.
//
// The key is arbitrary. All that matters is that every session contending for the ceiling names the
// same number, and this is the only advisory lock the application takes.
const RECIPE_CAP_LOCK_KEY = 831_071;
const LOCK_RECIPE_CAP = 'select pg_advisory_xact_lock($1)';
const COUNT_RECIPES = 'select count(*)::int as total from recipes';

const UNIQUE_VIOLATION = '23505';

// Setting the flag rather than flipping it. Both phones on one instance can send a toggle, and a
// flip would land in whatever order they arrived; a set is idempotent, so last-write-wins is
// correct here rather than a compromise, and a retry after a dropped response cannot undo itself.
const selectedBody = {
  type: 'object',
  required: ['selected'],
  additionalProperties: false,
  properties: { selected: { type: 'boolean' } },
};

const recipeIdParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: RECIPE_ID_MAX } },
};

/**
 * Trims what the cook typed or a parsed file produced, so a stored name never carries the
 * whitespace around it and the canonical-name index has nothing to disagree with.
 */
function normalize(body) {
  return {
    name: body.name.trim(),
    type: body.type,
    cardUrl: body.cardUrl ?? null,
    ingredients: (body.ingredients ?? []).map((ingredient) => ({
      name: ingredient.name.trim(),
      quantity: ingredient.quantity ?? null,
      unit: (ingredient.unit ?? '').trim(),
    })),
  };
}

/** The entry in one request that names an Ingredient an earlier entry already named, if any does. */
function findRepeatedIngredient(ingredients) {
  const seen = new Set();
  return ingredients.find((ingredient) => {
    const canonical = ingredient.name.toLowerCase();
    if (seen.has(canonical)) return true;
    seen.add(canonical);
    return false;
  });
}

/**
 * Whether this instance is already holding every Recipe it is configured for. Call inside the
 * transaction that inserts: the lock it takes is what makes the answer still true a moment later.
 */
async function atRecipeCap(client, recipesMax) {
  await client.query(LOCK_RECIPE_CAP, [RECIPE_CAP_LOCK_KEY]);
  const { rows } = await client.query(COUNT_RECIPES);
  return rows[0].total >= recipesMax;
}

async function insertRecipe(client, recipe) {
  const { rows } = await client.query(INSERT_RECIPE, [recipe.name, recipe.type, recipe.cardUrl]);
  const recipeId = rows[0].id;

  for (const ingredient of recipe.ingredients) {
    const { rows: ingredientRows } = await client.query(UPSERT_INGREDIENT, [ingredient.name]);
    await client.query(INSERT_RECIPE_INGREDIENT, [
      recipeId,
      ingredientRows[0].id,
      ingredient.quantity,
      ingredient.unit,
    ]);
  }

  return recipeId;
}

export function registerRecipeRoutes(app) {
  app.post(
    '/api/recipes',
    { schema: { body: createRecipeBody, response: { 201: recipeSchema } } },
    async (request, reply) => {
      const recipe = normalize(request.body);

      const repeated = findRepeatedIngredient(recipe.ingredients);
      if (repeated) {
        return reply
          .code(400)
          .send({ message: `This Recipe lists ${repeated.name} as an Ingredient twice.` });
      }

      const { recipesMax } = app.guardrails;

      let recipeId;
      const client = await app.db.connect();
      try {
        // One transaction, so a Recipe refused partway through leaves neither a half-written Recipe
        // nor an Ingredient nothing references.
        await client.query('begin');

        if (await atRecipeCap(client, recipesMax)) {
          await client.query('rollback');
          return reply.code(409).send({
            message: `This instance has room for ${recipesMax} Recipes and is holding all of them. Delete one to add another.`,
          });
        }

        recipeId = await insertRecipe(client, recipe);
        await client.query('commit');
      } catch (cause) {
        await client.query('rollback');
        // Two spellings JavaScript reads as different Ingredients and Postgres folds into one. The
        // check above catches the ordinary case; this catches whatever case folding disagrees on.
        if (cause.code === UNIQUE_VIOLATION) {
          return reply
            .code(400)
            .send({ message: 'This Recipe lists one Ingredient twice.' });
        }
        throw cause;
      } finally {
        client.release();
      }

      // Outside the transaction on purpose. Reading back is not part of the write, and a failure
      // here must not roll back a Recipe that is already committed.
      return reply.code(201).send(await readRecipe(app.db, recipeId));
    },
  );

  // No body comes back. The caller already knows what it set, and the Shopping List this changes is
  // derived rather than stored, so the only honest way to read it is the state request the client
  // makes next. Returning a stale-by-construction rollup from a write would be worse than silence.
  app.put(
    '/api/recipes/:id/selected',
    { schema: { params: recipeIdParams, body: selectedBody } },
    async (request, reply) => {
      const { rowCount } = await app.db.query(SET_SELECTED, [
        request.params.id,
        request.body.selected,
      ]);

      if (rowCount === 0) {
        return reply.code(404).send({ message: `There is no Recipe ${request.params.id}.` });
      }

      return reply.code(204).send();
    },
  );
}
