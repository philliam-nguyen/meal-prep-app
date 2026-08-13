// The narrowed remainder of ADR-0005's bounded exception.
//
// Recipes are arranged through the API now that the write endpoint exists. Two columns still have
// no endpoint to set them: `selected` waits on the Selected Recipe toggle, and `protected` waits on
// the Seed, which is the only thing allowed to set it. A read path that reports both has to be able
// to arrange both.
//
// This file goes when those two arrive. It does not create rows, so nothing here can arrange a
// Recipe the API would have refused.
//
// Runs as the restricted role, the same one the API uses.

/** Sets the flags on a Recipe the API created. */
export async function markRecipe(client, recipeId, { selected = false, isProtected = false }) {
  await client.query('update recipes set selected = $2, protected = $3 where id = $1', [
    recipeId,
    selected,
    isProtected,
  ]);
}
