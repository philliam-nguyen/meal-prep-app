// The rules for writing a Recipe, in one place. Fastify uses these as route schemas and the Add
// form compiles the same objects with ajv, so a rule cannot be tightened on the server and left
// loose in the browser (ADR-0005).

import { RECIPE_TYPES } from './recipeTypes.js';

// Both validators run with these. Fastify's defaults quietly repair a bad request rather than
// refusing it: an unknown property is dropped and a string is coerced into the number the schema
// asked for. Sharing the options is the other half of sharing the schema, because a form that
// refuses what the server silently accepts is the same drift in the opposite direction.
export const ajvOptions = { removeAdditional: false, coerceTypes: false, allErrors: true };

export const RECIPE_NAME_MAX = 120;
export const INGREDIENT_NAME_MAX = 80;
export const CARD_URL_MAX = 500;
export const UNIT_MAX = 20;

// A cooking measure larger than this is a typo rather than a quantity. Well inside numeric(10,3),
// so a value the schema accepts can never overflow the column.
export const QUANTITY_MAX = 100000;

// The smallest quantity numeric(10, 3) can hold. Anything under it rounds to zero on the way into
// the column, so accepting it would store exactly the value the range refuses.
export const QUANTITY_MIN = 0.001;

// A per-Recipe ceiling, which is also the first half of the row caps ADR-0001 asks for. The cap on
// total Recipes belongs to the ticket that adds it, because it counts rows rather than reading one
// request.
export const RECIPE_INGREDIENTS_MAX = 100;

// Scheme allowlist for the Recipe Card, and the whole of the stored-XSS fix: this URL is the one
// user-supplied value that reaches an href, which React's text escaping does not cover. Matching
// the literal scheme is what makes "javascript:" unrepresentable rather than filtered.
const HTTPS_URL = '^https://\\S+$';

// Free text with a length cap and a permissive character allowlist rather than an enumeration,
// because Recipes in the wild use inconsistent units and a strict set would fail the migration on
// real data. Empty is a unit-less quantity, which is why the class allows a zero-length string.
const UNIT_CHARACTERS = '^[A-Za-z0-9 ./-]*$';

// minLength alone would accept a name of three spaces. Requiring one non-space character keeps the
// rule in the schema instead of making it a check the server holds alone.
const HAS_CONTENT = '\\S';

const recipeIngredient = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: INGREDIENT_NAME_MAX, pattern: HAS_CONTENT },
    // Null is unquantified, "to taste". Zero is refused because a Recipe calling for none of
    // something is a mistake, and it would sum into the Shopping List as a real measurement.
    quantity: {
      type: ['number', 'null'],
      minimum: QUANTITY_MIN,
      maximum: QUANTITY_MAX,
    },
    unit: { type: 'string', maxLength: UNIT_MAX, pattern: UNIT_CHARACTERS },
  },
};

/** The body of a request creating a Recipe. */
export const createRecipeBody = {
  type: 'object',
  required: ['name', 'type'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: RECIPE_NAME_MAX, pattern: HAS_CONTENT },
    type: { type: 'string', enum: RECIPE_TYPES },
    cardUrl: { type: ['string', 'null'], maxLength: CARD_URL_MAX, pattern: HTTPS_URL },
    ingredients: {
      type: 'array',
      maxItems: RECIPE_INGREDIENTS_MAX,
      items: recipeIngredient,
    },
  },
};
