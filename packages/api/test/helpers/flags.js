// The narrowed remainder of ADR-0005's bounded exception.
//
// Recipes are arranged through the API, and the Selected Recipe flag now has an endpoint of its own,
// so it left this file. What is still here are the columns no endpoint owns yet: `protected` waits
// on the Seed, which is the only thing allowed to set it, and an Ingredient's Got It mark and Aisle
// wait on ticket 07. A read path that reports all three has to be able to arrange all three.
//
// This file goes when those arrive. It does not create rows, so nothing here can arrange a Recipe or
// an Ingredient the API would have refused.
//
// Runs as the restricted role, the same one the API uses.

/** Marks a Recipe the API created as Protected. */
export async function markRecipe(client, recipeId, { isProtected = false }) {
  await client.query('update recipes set protected = $2 where id = $1', [recipeId, isProtected]);
}

/** Sets the state an Ingredient carries on its own, independent of any Recipe. */
export async function markIngredient(client, ingredientId, { gotIt = false, aisle = null }) {
  await client.query('update ingredients set got_it = $2, aisle = $3 where id = $1', [
    ingredientId,
    gotIt,
    aisle,
  ]);
}
