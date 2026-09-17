// The module between what the forms hold and what the API is sent. It is pure - no JSX, no
// framework, no network - which is what puts it under `node --test` rather than under the browser
// suite (ADR-0005). What the browser suite proves is that a cook can type Steps and read them back;
// what this proves is the conversion underneath, including the blank rows a cook leaves behind.
//
// The rules themselves are not asserted here. They live in the shared schema this module compiles
// and are proven over HTTP; what is asserted is that a problem is reported against the row that
// produced it.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STEP_MAX } from '@meal-prep/shared';
import { findProblems, ingredientRow, stepRow, toRecipePayload } from '../src/recipeForm.js';

const form = (overrides = {}) => ({
  name: 'Beef Stew',
  type: 'Stew',
  cardUrl: '',
  rows: [ingredientRow({ name: 'Beef shin', quantity: 500, unit: 'g' })],
  stepRows: [],
  ...overrides,
});

describe('the Steps a payload carries', () => {
  it('carries them in the order the rows are in', () => {
    const payload = toRecipePayload(
      form({ stepRows: [stepRow({ text: 'Brown the beef.' }), stepRow({ text: 'Simmer it.' })] }),
    );

    assert.deepEqual(payload.steps, ['Brown the beef.', 'Simmer it.']);
  });

  // A cook adds a row and then thinks better of it, or the last row is the empty one waiting to be
  // typed into. Neither is a Step, and the API refuses a blank one, so they are dropped here for
  // the reason a blank Ingredient row is.
  it('drops a blank row rather than sending it', () => {
    const payload = toRecipePayload(
      form({
        stepRows: [stepRow({ text: 'Brown the beef.' }), stepRow(), stepRow({ text: '   ' })],
      }),
    );

    assert.deepEqual(payload.steps, ['Brown the beef.']);
  });

  it('trims what was typed rather than sending the whitespace around it', () => {
    const payload = toRecipePayload(form({ stepRows: [stepRow({ text: '  Brown the beef.  ' })] }));

    assert.deepEqual(payload.steps, ['Brown the beef.']);
  });

  it('carries no Steps at all for a Recipe that has none', () => {
    const payload = toRecipePayload(form({ stepRows: [stepRow()] }));

    assert.deepEqual(payload.steps, []);
  });
});

describe('finding a problem with a Step', () => {
  it('reports an over-long Step against the Step that is too long', () => {
    const payload = toRecipePayload(
      form({ stepRows: [stepRow({ text: 'Brown the beef.' }), stepRow({ text: 'x'.repeat(STEP_MAX + 1) })] }),
    );

    const problems = findProblems(payload);

    assert.equal(problems['/steps/1'], `Keep this under ${STEP_MAX} characters.`);
  });

  it('finds nothing wrong with a Recipe whose Steps are all within the cap', () => {
    const payload = toRecipePayload(form({ stepRows: [stepRow({ text: 'x'.repeat(STEP_MAX) })] }));

    assert.deepEqual(findProblems(payload), {});
  });
});
