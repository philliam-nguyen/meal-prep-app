// The filter behind the Ingredients by Aisle section on Settings: pure over the `ingredients` array
// the state response already carries, run again on every keystroke and every flip of the unassigned
// switch. `unassignedOnly` and `filterIngredients` are checked separately from how the search box
// narrows by name, which is `filterByName` in pantryViews.js and already has its own tests.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterIngredients, unassignedOnly } from '../src/ingredientFiling.js';

function ingredient(name, aisleId, staple = false) {
  return { id: name, name, aisleId, staple };
}

describe('unassignedOnly', () => {
  it('keeps only the Ingredients with no Aisle', () => {
    const ingredients = [
      ingredient('Onion', 'A001'),
      ingredient('Flour', null),
      ingredient('Salt', null, true),
    ];

    assert.deepEqual(
      unassignedOnly(ingredients).map((i) => i.name),
      ['Flour', 'Salt'],
    );
  });

  it('has nothing to keep when every Ingredient is filed', () => {
    assert.deepEqual(unassignedOnly([ingredient('Onion', 'A001')]), []);
  });
});

describe('filterIngredients', () => {
  const ingredients = [
    ingredient('Chickpeas', 'A001'),
    ingredient('Chicken stock', null),
    ingredient('Flour', null, true),
  ];

  it('returns everything when nothing is asked for', () => {
    assert.deepEqual(filterIngredients(ingredients), ingredients);
  });

  it('narrows by name, case-insensitive and trimmed, the same as the Pantry search', () => {
    assert.deepEqual(
      filterIngredients(ingredients, { search: '  CHICK ' }).map((i) => i.name),
      ['Chickpeas', 'Chicken stock'],
    );
  });

  it('narrows to Ingredients with no Aisle when the unassigned filter is on', () => {
    assert.deepEqual(
      filterIngredients(ingredients, { unassigned: true }).map((i) => i.name),
      ['Chicken stock', 'Flour'],
    );
  });

  it('combines the search and the unassigned filter', () => {
    assert.deepEqual(
      filterIngredients(ingredients, { search: 'chick', unassigned: true }).map((i) => i.name),
      ['Chicken stock'],
    );
  });

  it('finds nothing when the search matches an Ingredient the unassigned filter excludes', () => {
    assert.deepEqual(filterIngredients(ingredients, { search: 'chickpeas', unassigned: true }), []);
  });
});
