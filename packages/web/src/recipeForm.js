// Between the Add form's strings and the API's typed JSON.
//
// The rules are not here. They are in the shared schema this module compiles, the same object
// Fastify enforces, so the form refuses exactly what the server refuses (ADR-0005). What is here is
// the conversion from what a text input holds to what the wire carries, which the server never
// needs because it is handed JSON already.
//
// The one rule the API keeps to itself is that a Recipe cannot name one food twice. JSON Schema
// cannot state it, and the ADR is explicit that such a check is written once on the server rather
// than copied here, so the form shows the API's refusal instead of predicting it.

import Ajv from 'ajv';
import { ajvOptions, createRecipeBody } from '@meal-prep/shared';

const validate = new Ajv(ajvOptions).compile(createRecipeBody);

// Rows carry an id so React keys survive a removal from the middle, and so a validation error
// reported against the third ingredient in the payload can be shown against the row that produced
// it rather than the third row on screen. The two differ whenever a blank row sits above.
let lastRowId = 0;

export const ingredientRow = ({ name = '', quantity = null, unit = '' } = {}) => ({
  id: (lastRowId += 1),
  name,
  quantity: quantity === null ? '' : String(quantity),
  unit,
});

/** The rows that will reach the API. A row naming nothing is scaffolding, not an Ingredient. */
export const rowsNamingIngredient = (rows) => rows.filter((row) => row.name.trim());

/**
 * An empty box is unquantified, "to taste". Text that is not a number stays text so the schema
 * refuses it and the cook is told; turning it into null here would silently discard what they
 * typed and store a Recipe that does not say what they meant.
 */
function toQuantity(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : trimmed;
}

/** The form's state as the API's request body. */
export function toRecipePayload({ name, type, cardUrl, rows }) {
  return {
    name: name.trim(),
    type,
    cardUrl: cardUrl.trim() || null,
    ingredients: rowsNamingIngredient(rows).map((row) => ({
      name: row.name.trim(),
      quantity: toQuantity(row.quantity),
      unit: row.unit.trim(),
    })),
  };
}

function messageFor(error) {
  const { keyword, params, instancePath } = error;

  if (keyword === 'pattern' && instancePath === '/cardUrl') {
    return 'Must be a full https:// address.';
  }
  if (keyword === 'pattern' && instancePath.endsWith('/unit')) {
    return 'Letters, numbers and . / - only.';
  }
  if (keyword === 'pattern') return 'Cannot be only spaces.';
  if (keyword === 'maxLength') return `Keep this under ${params.limit} characters.`;
  if (keyword === 'minLength') return 'Required.';
  if (keyword === 'enum') return 'Choose one of the listed types.';
  if (keyword === 'minimum') return `Must be ${params.limit} or more.`;
  if (keyword === 'maximum') return `Must be ${params.limit} or less.`;
  if (keyword === 'maxItems') return `A Recipe can hold ${params.limit} ingredients.`;
  if (keyword === 'type' && instancePath.endsWith('/quantity')) return 'Numbers only.';
  if (keyword === 'required') return 'Required.';

  return 'Not allowed here.';
}

/**
 * Field errors keyed by JSON Pointer, so `/name` and `/ingredients/2/quantity` each land on the
 * input that produced them. An empty object means the payload is good.
 */
export function findProblems(payload) {
  if (validate(payload)) return {};

  return Object.fromEntries(
    validate.errors.map((error) => {
      const path =
        error.keyword === 'required'
          ? `${error.instancePath}/${error.params.missingProperty}`
          : error.instancePath;
      return [path, messageFor(error)];
    }),
  );
}
