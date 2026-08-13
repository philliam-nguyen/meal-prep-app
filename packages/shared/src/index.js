// Imported by both the API and the frontend so that server guardrails and form validation cannot
// drift apart. See "An API tier is forced" in the migration spec.
//
// The rules travel as JSON Schema rather than as functions (ADR-0005): Fastify validates requests
// with them and the form runs the same objects through ajv, so there is one definition rather than
// a server copy and a client copy. Anything JSON Schema cannot express is a check the API makes
// once and the form does not repeat.

export { RECIPE_TYPES } from './recipeTypes.js';
export {
  CARD_URL_MAX,
  INGREDIENT_NAME_MAX,
  QUANTITY_MAX,
  QUANTITY_MIN,
  RECIPE_INGREDIENTS_MAX,
  RECIPE_NAME_MAX,
  UNIT_MAX,
  ajvOptions,
  createRecipeBody,
} from './schema.js';
export { parseCsvFile, parseRecipeFile, parseTextFile } from './recipeFiles.js';
