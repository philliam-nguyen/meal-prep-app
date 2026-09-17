// The Shopping List grouped by Aisle, the way the page reads it: a pure function over the two
// arrays the state response already carries, run again on every optimistic update the same way
// the Pantry's split and filter are.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupByAisle } from '../src/shoppingListViews.js';

function aisle(id, name) {
  return { id, name };
}

function entry(ingredientId, aisleId, gotIt = false, covered = false) {
  return { ingredientId, name: ingredientId, aisleId, gotIt, covered, amounts: [] };
}

const WALK = [aisle('A001', 'Produce'), aisle('A002', 'Bakery'), aisle('A003', 'Frozen')];

describe('groupByAisle', () => {
  it('groups entries under their Aisle in walk order', () => {
    const list = [entry('leek', 'A001'), entry('bread', 'A002'), entry('peas', 'A003')];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups.map(g => g.aisleId), ['A001', 'A002', 'A003']);
    assert.deepEqual(groups.map(g => g.name), ['Produce', 'Bakery', 'Frozen']);
    assert.deepEqual(groups.map(g => g.entries.map(e => e.ingredientId)), [['leek'], ['bread'], ['peas']]);
  });

  it('puts entries with no Aisle last, under a group with no Aisle id', () => {
    const list = [entry('leek', 'A001'), entry('mystery', null)];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups.map(g => g.aisleId), ['A001', null]);
    assert.deepEqual(groups.at(-1).entries.map(e => e.ingredientId), ['mystery']);
  });

  it('gives an Aisle with nothing filed under it no group at all', () => {
    const list = [entry('leek', 'A001')];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups.map(g => g.aisleId), ['A001']);
  });

  it('has no unassigned group when every entry has an Aisle', () => {
    const list = [entry('leek', 'A001')];

    const groups = groupByAisle(list, WALK);

    assert.equal(groups.some(g => g.aisleId === null), false);
  });

  it('has no groups at all for an empty list', () => {
    assert.deepEqual(groupByAisle([], WALK), []);
  });

  it('treats an Aisle id the walk no longer carries as unassigned', () => {
    const list = [entry('leek', 'A404')];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups, [{ aisleId: null, name: null, entries: [entry('leek', 'A404')] }]);
  });

  it('sinks Got It entries to the bottom of their group, keeping the API order within each half', () => {
    const list = [
      entry('onion', 'A001', true),
      entry('leek', 'A001', false),
      entry('potato', 'A001', false),
      entry('thyme', 'A001', true),
    ];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups[0].entries.map(e => e.ingredientId), ['leek', 'potato', 'onion', 'thyme']);
  });

  it('sinks Got It entries within the unassigned group too', () => {
    const list = [entry('mystery', null, true), entry('other', null, false)];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups[0].entries.map(e => e.ingredientId), ['other', 'mystery']);
  });

  it('sinks Covered entries to the bottom of their group, keeping the API order within each half', () => {
    const list = [
      entry('onion', 'A001', false, true),
      entry('leek', 'A001'),
      entry('potato', 'A001'),
      entry('thyme', 'A001', false, true),
    ];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups[0].entries.map(e => e.ingredientId), ['leek', 'potato', 'onion', 'thyme']);
  });

  it('sinks an entry that is both Got It and Covered once, alongside either mark on its own', () => {
    const list = [
      entry('onion', 'A001', true, false),
      entry('leek', 'A001', false, false),
      entry('potato', 'A001', false, true),
      entry('thyme', 'A001', true, true),
    ];

    const groups = groupByAisle(list, WALK);

    assert.deepEqual(groups[0].entries.map(e => e.ingredientId), ['leek', 'onion', 'potato', 'thyme']);
  });

  it('leaves the list and the walk it was given alone', () => {
    const list = [entry('leek', 'A001')];
    const before = JSON.stringify(list);
    const walkBefore = JSON.stringify(WALK);

    groupByAisle(list, WALK);

    assert.equal(JSON.stringify(list), before);
    assert.equal(JSON.stringify(WALK), walkBefore);
  });
});
