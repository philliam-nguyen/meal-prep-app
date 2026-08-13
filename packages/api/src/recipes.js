// Writing a Recipe. The rules live in the shared schema module, which Fastify enforces here and the
// Add form compiles in the browser, so there is no server copy to drift from a client copy
// (ADR-0005). What is left in this file is the part JSON Schema cannot state: that two Recipe
// Ingredients in one request must not name the same food.
//
// Every statement is parameterized. Nothing on this path builds SQL from a string.

import { createRecipeBody } from '@meal-prep/shared';
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

const UNIQUE_VIOLATION = '23505';

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

      let recipeId;
      const client = await app.db.connect();
      try {
        // One transaction, so a Recipe refused partway through leaves neither a half-written Recipe
        // nor an Ingredient nothing references.
        await client.query('begin');
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
}
