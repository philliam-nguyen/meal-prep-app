// The split and the filter the Pantry page runs on every render: pure functions over the checklist
// the state response already carried, asked to do exactly what a cook does - move something across,
// or narrow both views by typing - and checked against the list that comes back.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterByName, splitByMembership } from '../src/pantryViews.js';

function item(name, inPantry) {
  return { id: name, name, inPantry };
}

describe('splitByMembership', () => {
  it('separates what is in the Pantry from what is not, keeping arrival order', () => {
    const checklist = [item('chickpeas', true), item('flour', false), item('butter', true)];

    const { inPantry, notInPantry } = splitByMembership(checklist);

    assert.deepEqual(inPantry.map(i => i.name), ['chickpeas', 'butter']);
    assert.deepEqual(notInPantry.map(i => i.name), ['flour']);
  });

  it('gives an empty view its own empty array rather than omitting it', () => {
    const { inPantry, notInPantry } = splitByMembership([item('flour', false)]);

    assert.deepEqual(inPantry, []);
    assert.deepEqual(notInPantry, [item('flour', false)]);
  });

  it('has nothing to split when the checklist is empty', () => {
    const { inPantry, notInPantry } = splitByMembership([]);

    assert.deepEqual(inPantry, []);
    assert.deepEqual(notInPantry, []);
  });
});

describe('filterByName', () => {
  const items = [item('Chickpeas', false), item('Flour', true), item('Chicken stock', false)];

  it('matches a substring anywhere in the name, ignoring case', () => {
    assert.deepEqual(filterByName(items, 'chick').map(i => i.name), ['Chickpeas', 'Chicken stock']);
  });

  it('ignores whitespace surrounding the term', () => {
    assert.deepEqual(filterByName(items, '  flour  ').map(i => i.name), ['Flour']);
  });

  it('returns everything for an empty term', () => {
    assert.deepEqual(filterByName(items, ''), items);
  });

  it('returns everything for a term that is only whitespace', () => {
    assert.deepEqual(filterByName(items, '   '), items);
  });

  it('returns nothing when the term matches no name', () => {
    assert.deepEqual(filterByName(items, 'quinoa'), []);
  });
});
