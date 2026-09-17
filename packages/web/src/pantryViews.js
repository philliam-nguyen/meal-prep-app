// The Pantry checklist arrives from the state response as one list, Staples already left out of it
// (the API never puts one there). The page reads it as two views - what's in the Pantry and what
// isn't - over one search box, and both are questions this list alone can answer. No new endpoint:
// splitting by membership and filtering by name are pure functions over what the first paint already
// fetched, run again on every keystroke and every optimistic toggle.

/**
 * The checklist split into what's in the Pantry and what isn't, in the order it arrived. Nothing
 * here looks at Staples - the checklist passed in has none to begin with - and nothing ranks either
 * half; the API's order is the only order.
 */
export function splitByMembership(checklist) {
  const inPantry = checklist.filter(item => item.inPantry);
  const notInPantry = checklist.filter(item => !item.inPantry);
  return { inPantry, notInPantry };
}

/**
 * Ingredients whose name contains `term`, case-insensitive and ignoring whitespace around the term -
 * the same canonicalisation the schema already applies to a name, so "Chick" finds "chickpeas". A
 * term that is empty once trimmed matches everything, which is what a cleared search means.
 */
export function filterByName(items, term) {
  const needle = term.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(item => item.name.toLowerCase().includes(needle));
}
