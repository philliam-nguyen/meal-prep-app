// Arranging state by loading rows directly, which the testing seam otherwise forbids.
//
// It is a bounded exception recorded in ADR-0005: there is no write endpoint yet, so a read path
// has no API to arrange through. Assertions still only ever read HTTP responses, so nothing here
// leaks into what is being proven. The exception closes when the write endpoint exists, and this
// file goes with it rather than staying for convenience.
//
// Runs as the restricted role, the same one the API uses, so an arrangement that the API's grants
// would refuse fails here rather than passing under privileges the app does not have.

/** Inserts an Ingredient, or returns the existing one when the canonical name is already taken. */
export async function loadIngredient(client, { name, staple = false, aisle = null }) {
  const { rows } = await client.query(
    `insert into ingredients (name, staple, aisle) values ($1, $2, $3)
     on conflict (lower(btrim(name))) do update set name = ingredients.name
     returning id`,
    [name, staple, aisle],
  );
  return rows[0].id;
}

/**
 * Inserts a Recipe and its Recipe Ingredients, creating any Ingredient it names that does not exist
 * yet. Naming one food from two Recipes attaches both to the same Ingredient row.
 */
export async function loadRecipe(
  client,
  { name, type, card_url = null, selected = false, protected: isProtected = false, ingredients = [] },
) {
  const { rows } = await client.query(
    `insert into recipes (name, type, card_url, selected, protected)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [name, type, card_url, selected, isProtected],
  );
  const recipeId = rows[0].id;

  for (const { name: food, quantity = null, unit = '' } of ingredients) {
    const ingredientId = await loadIngredient(client, { name: food });
    await client.query(
      `insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
       values ($1, $2, $3, $4)`,
      [recipeId, ingredientId, quantity, unit],
    );
  }

  return recipeId;
}
