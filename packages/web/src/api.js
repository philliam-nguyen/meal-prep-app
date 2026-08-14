// The API serves this bundle from its own origin in both Variants, so every path here is relative
// and the frontend carries no per-Variant configuration at all (ADR-0002). Nothing to configure,
// nothing to paste into a settings screen, no key.

/** Everything the first paint needs, in one request. */
export async function fetchState() {
  const response = await fetch('/api/state');
  if (!response.ok) throw new Error(`GET /api/state returned ${response.status}`);
  return response.json();
}

/**
 * Creates a Recipe. The form has already validated against the same schema the API enforces, so a
 * refusal here is either a rule only the server can check or a bug in the pair; both are worth
 * showing the cook verbatim rather than flattening into "could not save".
 */
export async function createRecipe(recipe) {
  const response = await fetch('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  });

  if (response.ok) return response.json();

  const refusal = await response.json().catch(() => null);
  throw new Error(refusal?.message ?? `POST /api/recipes returned ${response.status}`);
}

/**
 * Marks a Recipe as a Selected Recipe, or unmarks it. Sends the value it wants rather than asking
 * for a flip, so a retry after a dropped response cannot undo the write it is retrying.
 *
 * Nothing comes back. The Shopping List this changes is derived on the server, so the caller reads
 * it with the next state request rather than from this reply.
 */
export async function setRecipeSelected(recipeId, selected) {
  const response = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/selected`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected }),
  });

  if (!response.ok) {
    throw new Error(`PUT /api/recipes/${recipeId}/selected returned ${response.status}`);
  }
}

async function putIngredientField(ingredientId, field, body) {
  const path = `/api/ingredients/${encodeURIComponent(ingredientId)}/${field}`;
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.ok) return;

  // The server names the Ingredient it refused, which is worth showing rather than flattening into
  // a status code.
  const refusal = await response.json().catch(() => null);
  throw new Error(refusal?.message ?? `PUT ${path} returned ${response.status}`);
}

/**
 * Puts an Ingredient in the Pantry or takes it out. A value rather than a flip, for the reason the
 * Selected Recipe toggle sends one: two phones share one Pantry, and a flip sent from a screen that
 * has gone stale lands on the opposite of what the cook saw.
 *
 * Nothing comes back. Best Matches is derived on the server, so the new ranking arrives with the
 * next state request rather than from this reply.
 */
export async function setIngredientPantry(ingredientId, inPantry) {
  return putIngredientField(ingredientId, 'pantry', { inPantry });
}

/** Marks an Ingredient a Staple, or stops it being one. */
export async function setIngredientStaple(ingredientId, staple) {
  return putIngredientField(ingredientId, 'staple', { staple });
}
