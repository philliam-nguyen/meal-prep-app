// The filter behind the Ingredients by Aisle section on Settings: pure over the `ingredients` array
// the state response already carries, the way pantryViews.js is pure over the Pantry checklist. No
// new endpoint - narrowing by name and by whether an Aisle is filed yet are both questions the whole
// collection the first paint already fetched can answer, run again on every keystroke and every
// optimistic write.

import { filterByName } from './pantryViews.js';

/** The Ingredients still waiting on the initial sort: the ones with no Aisle filed yet. */
export function unassignedOnly(ingredients) {
  return ingredients.filter(ingredient => ingredient.aisleId === null);
}

/**
 * The name search and the unassigned switch, combined. Order between them makes no difference -
 * both are predicates over the same list - so this always narrows by name first, the same
 * case-insensitive trimmed substring match the Pantry search uses.
 */
export function filterIngredients(ingredients, { search = '', unassigned = false } = {}) {
  const byName = filterByName(ingredients, search);
  return unassigned ? unassignedOnly(byName) : byName;
}
