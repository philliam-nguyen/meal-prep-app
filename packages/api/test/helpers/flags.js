// The last of ADR-0005's bounded exception, narrower again.
//
// Got It and Aisle left this file with ticket 07, which gave them endpoints, so the tests that used
// to arrange them here now do it the way a cook does. What is still here is `protected`, which waits
// on the Seed in ticket 12 - the only thing allowed to set it - because the browse payload reports a
// column nothing else can yet write.
//
// This file goes when that arrives. It does not create rows, so nothing here can arrange a Recipe
// the API would have refused.
//
// Runs as the restricted role, the same one the API uses.

/** Marks a Recipe the API created as Protected. */
export async function markRecipe(client, recipeId, { isProtected = false }) {
  await client.query('update recipes set protected = $2 where id = $1', [recipeId, isProtected]);
}
