// Moving one section of the store one place through the walk. The API takes the whole ordered list
// of ids and never a position, so what an up or down button has to produce is that list - which
// makes this arithmetic rather than presentation, and the kind of thing ADR-0005 says gets a
// `node --test` of its own beside freshness.js.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { walkAfterMoving } from '../src/aisleOrder.js';

const WALK = [
  { id: 'A001', name: 'Produce' },
  { id: 'A002', name: 'Bakery' },
  { id: 'A003', name: 'Frozen' },
];

describe('moving an Aisle through the walk', () => {
  it('swaps it with the section before it', () => {
    assert.deepEqual(walkAfterMoving(WALK, 'A003', -1), ['A001', 'A003', 'A002']);
  });

  it('swaps it with the section after it', () => {
    assert.deepEqual(walkAfterMoving(WALK, 'A001', 1), ['A002', 'A001', 'A003']);
  });

  // The API refuses anything but the whole list, so a move that cannot happen has to send nothing
  // rather than send a walk with a hole in it.
  it('has nowhere to send the first section upward', () => {
    assert.equal(walkAfterMoving(WALK, 'A001', -1), null);
  });

  it('has nowhere to send the last section downward', () => {
    assert.equal(walkAfterMoving(WALK, 'A003', 1), null);
  });

  it('has nothing to move for an Aisle that is not on the walk', () => {
    assert.equal(walkAfterMoving(WALK, 'A404', -1), null);
  });

  it('leaves the walk it was given alone', () => {
    const before = WALK.map((aisle) => aisle.id);

    walkAfterMoving(WALK, 'A001', 1);

    assert.deepEqual(
      WALK.map((aisle) => aisle.id),
      before,
    );
  });

  it('carries every section, so the whole walk is what gets sent', () => {
    assert.deepEqual([...walkAfterMoving(WALK, 'A002', 1)].sort(), ['A001', 'A002', 'A003']);
  });
});
