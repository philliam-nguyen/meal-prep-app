// The API serves this bundle from its own origin in both Variants, so every path here is relative
// and the frontend carries no per-Variant configuration at all (ADR-0002). Nothing to configure,
// nothing to paste into a settings screen, no key.

/** Everything the first paint needs, in one request. */
export async function fetchState() {
  const response = await fetch('/api/state');
  if (!response.ok) throw new Error(`GET /api/state returned ${response.status}`);
  return response.json();
}
