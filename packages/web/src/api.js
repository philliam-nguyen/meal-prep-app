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
