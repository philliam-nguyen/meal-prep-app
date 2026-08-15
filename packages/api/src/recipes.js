// Writing a Recipe, editing one, deleting one, and marking one as a Selected Recipe. The rules for
// the Recipe a cook types live in the shared schema module, which Fastify enforces here and the
// Recipe form compiles in the browser, so there is no server copy to drift from a client copy
// (ADR-0005). What is left in this file is the part JSON Schema cannot state: that two Recipe
// Ingredients in one request must not name the same food.
//
// An edit is held to `createRecipeBody` unchanged, because a Recipe a cook may not create is a
// Recipe they may not edit their way into. The name says "create" for the route that came first;
// what it describes is the body of any request writing a Recipe.
//
// The Selected Recipe route validates against a schema declared here instead, because no form
// compiles it: a checkbox has nothing to validate before it sends, so shared would gain a rule with
// one importer.
//
// Every statement is parameterized. Nothing on this path builds SQL from a string.

import { RECIPE_ID_MAX, RECIPE_INGREDIENTS_MAX, createRecipeBody } from '@meal-prep/shared';
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

// The Protected guard is in the statement rather than in a read the handler does first, so there is
// no window between checking the flag and writing the row. `selected` and `protected` are absent on
// purpose: neither is a field the body carries, and an edit that cleared the Selected Recipe flag
// would take a Recipe off the Shopping List for the sake of fixing a typo in its name.
//
// updated_at is set here rather than left to the trigger. The trigger fires only when the recipes
// row itself differs, and a Recipe is its Ingredients as much as its name: an edit correcting a
// quantity changes the Recipe while leaving this row identical, so the trigger would not fire and
// the Recipe would go on claiming it had not been touched. Setting it means a rewrite that changes
// nothing at all also moves the timestamp, which costs a redundant refetch. Missing a real edit
// costs a cook shopping from a list that is wrong, which is the worse of the two.
const UPDATE_RECIPE = `
  update recipes
  set name = $2, type = $3, card_url = $4, updated_at = now()
  where id = $1 and not protected
`;

// Its Recipe Ingredients are replaced rather than reconciled: the request carries the whole set, so
// what is here now is what the cook is looking at. Reconciling would be three statements deciding
// which rows to keep, to answer a question the request has already answered.
const DELETE_RECIPE_INGREDIENTS = 'delete from recipe_ingredients where recipe_id = $1';

// recipe_ingredients cascades and the Shopping List is derived, so this is the whole of removing a
// Recipe from the app. The Ingredients it named stay: each has an identity of its own carrying
// Pantry membership, an Aisle and a Got It mark that no Recipe owns.
// No "returning" here or on the update above, for the reason SET_SELECTED gives below: the row
// count already answers the only question the handler asks.
const DELETE_RECIPE = `
  delete from recipes
  where id = $1 and not protected
`;

// Only read when a write has already matched no row, so the ordinary edit stays on one path and
// only a refusal pays for the explanation.
const FIND_RECIPE = 'select name, protected from recipes where id = $1';

// No "returning", because the row count already answers the only question the handler asks: whether
// a Recipe by that id was there to update.
const SET_SELECTED = `
  update recipes set selected = $2 where id = $1
`;

// The absolute ceilings on rows (ADR-0001). Counting and then inserting is only an approximate cap:
// two writes arriving together both read a count below the ceiling and both insert. Taking a lock
// first is what makes it exact. The lock is released when the transaction ends, and it is advisory
// rather than a lock on a table, so it serializes the writes that mint rows without standing in the
// way of any other write. Those writes are rare and human-paced, so serializing them costs nothing
// worth measuring.
//
// The key is arbitrary. All that matters is that every session contending for a ceiling names the
// same number, and this is the only advisory lock the application takes. Creating and editing share
// it because they contend for the same Ingredient ceiling.
const ROW_CAP_LOCK_KEY = 831_071;
const LOCK_ROW_CAPS = 'select pg_advisory_xact_lock($1)';
const COUNT_RECIPES = 'select count(*)::int as total from recipes';
const COUNT_INGREDIENTS = 'select count(*)::int as total from ingredients';

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
 * Serializes the writes that mint rows against each other, so a count taken after it is still true
 * when the transaction commits. Call first, inside the transaction.
 */
async function lockRowCaps(client) {
  await client.query(LOCK_ROW_CAPS, [ROW_CAP_LOCK_KEY]);
}

/** Whether this instance is already holding every Recipe it is configured for. */
async function atRecipeCap(client, recipesMax) {
  const { rows } = await client.query(COUNT_RECIPES);
  return rows[0].total >= recipesMax;
}

// The ceiling on Ingredient rows, derived rather than configured because it is the bound that was
// already true. Before a Recipe could be edited or deleted, the only way to mint an Ingredient was
// creating a Recipe, and a Recipe was capped at RECIPE_INGREDIENTS_MAX of them and could never be
// freed, so the table could never hold more than every Recipe's worth. Editing broke that on its
// own: a Recipe rewritten with a hundred new foods leaves the old hundred behind and can be
// rewritten again, forever. This restores the old bound rather than choosing a new one, so it needs
// no setting of its own and no wrapper has to learn about it.
const ingredientCeiling = (recipesMax) => recipesMax * RECIPE_INGREDIENTS_MAX;

/**
 * Whether the rows this transaction has just written put the instance past that ceiling. Asked
 * after the write rather than before, because how many Ingredients a request creates depends on how
 * many of the foods it names are already here, and the upserts are what answer that. The
 * transaction rolls back, so a request that oversteps leaves nothing behind.
 */
async function overIngredientCeiling(client, recipesMax) {
  const { rows } = await client.query(COUNT_INGREDIENTS);
  return rows[0].total > ingredientCeiling(recipesMax);
}

// No advice to give: nothing in the app deletes an Ingredient, so telling a cook to free one would
// be telling them to do something they cannot. Deleting a Recipe frees a Recipe slot and no
// Ingredient, which is why this refusal does not borrow the other one's wording.
const ingredientCeilingRefusal = (recipesMax) => ({
  message: `This instance has room for ${ingredientCeiling(recipesMax)} Ingredients and is holding all of them.`,
});

/**
 * Attaches each Recipe Ingredient to the Ingredient it names, creating that Ingredient only if no
 * Recipe has named the food before. Shared by the create and the edit, so the two cannot disagree
 * about when a second spelling becomes a second Ingredient.
 *
 * In canonical name order rather than the order the cook typed. The upsert takes a row lock it
 * holds for the rest of the transaction, so two Recipes being written at once that both name butter
 * and flour, in opposite orders, would each hold one and wait for the other until Postgres broke
 * the tie by aborting one of them. Every transaction taking these locks in the same order is what
 * makes that impossible rather than rare.
 */
async function insertRecipeIngredients(client, recipeId, ingredients) {
  const inLockOrder = [...ingredients].sort((a, b) =>
    a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
  );

  for (const ingredient of inLockOrder) {
    const { rows } = await client.query(UPSERT_INGREDIENT, [ingredient.name]);
    await client.query(INSERT_RECIPE_INGREDIENT, [
      recipeId,
      rows[0].id,
      ingredient.quantity,
      ingredient.unit,
    ]);
  }
}

async function insertRecipe(client, recipe) {
  const { rows } = await client.query(INSERT_RECIPE, [recipe.name, recipe.type, recipe.cardUrl]);
  const recipeId = rows[0].id;

  await insertRecipeIngredients(client, recipeId, recipe.ingredients);

  return recipeId;
}

/**
 * Why a write naming a Recipe matched no row: either there is no such Recipe, or there is one that
 * is Protected. The refusal names the Recipe, so a visitor meeting it knows which row refused
 * rather than only that something did.
 *
 * It says Protected rather than naming a Variant. Nothing here knows which deployment it is
 * (ADR-0002); it knows the flag is set, and the flag is the reason.
 *
 * The flag is read rather than assumed from the row existing. Those two are the same thing only
 * while the guarded statements carry exactly the one condition they carry today, and a 403 is a
 * confident answer to give on the strength of a condition somebody may add later. The last branch
 * is unreachable now: it is what stops this from inventing a reason it has not checked.
 */
async function explainRefusal(db, id) {
  const { rows } = await db.query(FIND_RECIPE, [id]);
  if (rows.length === 0) return { code: 404, message: `There is no Recipe ${id}.` };
  if (rows[0].protected) {
    return {
      code: 403,
      message: `${rows[0].name} is Protected, so it cannot be changed or deleted.`,
    };
  }
  return {
    code: 409,
    message: `${rows[0].name} changed while this was being saved. Open it again and retry.`,
  };
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
        await lockRowCaps(client);

        if (await atRecipeCap(client, recipesMax)) {
          await client.query('rollback');
          return reply.code(409).send({
            message: `This instance has room for ${recipesMax} Recipes and is holding all of them. Delete one to add another.`,
          });
        }

        recipeId = await insertRecipe(client, recipe);

        // A create cannot pass the Ingredient ceiling on its own, since the ceiling is every
        // Recipe's worth and a Recipe is capped at one Recipe's worth. It can once an edit has left
        // orphans behind, which is why this is asked here and not only on the edit.
        if (await overIngredientCeiling(client, recipesMax)) {
          await client.query('rollback');
          return reply.code(409).send(ingredientCeilingRefusal(recipesMax));
        }

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

  // The whole Recipe, not the field that changed. The form has all of it on screen, so sending all
  // of it makes the write idempotent and last-write-wins in the same way every other write in this
  // app is: two phones editing one Recipe end on what the later one saw, rather than on a merge
  // neither cook asked for.
  app.put(
    '/api/recipes/:id',
    {
      schema: {
        params: recipeIdParams,
        body: createRecipeBody,
        response: { 200: recipeSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const recipe = normalize(request.body);

      const repeated = findRepeatedIngredient(recipe.ingredients);
      if (repeated) {
        return reply
          .code(400)
          .send({ message: `This Recipe lists ${repeated.name} as an Ingredient twice.` });
      }

      const client = await app.db.connect();
      try {
        // One transaction, so an edit refused partway through leaves the Recipe as it was rather
        // than holding its old name beside its new Recipe Ingredients.
        await client.query('begin');
        await lockRowCaps(client);

        const { rowCount } = await client.query(UPDATE_RECIPE, [
          id,
          recipe.name,
          recipe.type,
          recipe.cardUrl,
        ]);

        if (rowCount === 0) {
          await client.query('rollback');
          const refusal = await explainRefusal(app.db, id);
          return reply.code(refusal.code).send({ message: refusal.message });
        }

        await client.query(DELETE_RECIPE_INGREDIENTS, [id]);
        await insertRecipeIngredients(client, id, recipe.ingredients);

        // The write an edit makes that a create cannot: the foods it stops naming leave their
        // Ingredients behind, so rewriting one Recipe with fresh names over and over grows the
        // table without bound. Asked after the upserts, because only they know how many of these
        // foods were already here.
        if (await overIngredientCeiling(client, app.guardrails.recipesMax)) {
          await client.query('rollback');
          return reply.code(409).send(ingredientCeilingRefusal(app.guardrails.recipesMax));
        }

        await client.query('commit');
      } catch (cause) {
        await client.query('rollback');
        // The same folding disagreement the create guards against: two spellings JavaScript reads
        // as different Ingredients and Postgres resolves to one row.
        if (cause.code === UNIQUE_VIOLATION) {
          return reply.code(400).send({ message: 'This Recipe lists one Ingredient twice.' });
        }
        throw cause;
      } finally {
        client.release();
      }

      // Outside the transaction, for the reason the create reads back outside its own: reading is
      // not part of the write, and a failure here must not undo an edit that is already committed.
      return reply.code(200).send(await readRecipe(app.db, id));
    },
  );

  // No body comes back, and none is wanted: what a caller would do with a copy of a Recipe that no
  // longer exists is nothing. The Shopping List it was on is derived, so it loses the Recipe on the
  // next read without a second write.
  app.delete(
    '/api/recipes/:id',
    { schema: { params: recipeIdParams } },
    async (request, reply) => {
      const { id } = request.params;
      const { rowCount } = await app.db.query(DELETE_RECIPE, [id]);

      if (rowCount === 0) {
        const refusal = await explainRefusal(app.db, id);
        return reply.code(refusal.code).send({ message: refusal.message });
      }

      return reply.code(204).send();
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
