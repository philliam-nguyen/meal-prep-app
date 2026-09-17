// Everything an Ingredient carries on its own, independent of any one Recipe: the Pantry checklist
// a cook ticks, the Staples they have stopped being asked about, the Aisle it is found in and the
// Got It mark made while walking that aisle.
//
// The Pantry and Staple lists are separate here rather than one collection with a flag, because
// "Staples never appear in the Pantry checklist" is then a property of this file that a test can
// hold to, instead of a filter in the frontend that nothing checks.
//
// Every write sends the value it wants rather than asking for a flip. One list is shared by two
// phones, so a flip sent from a screen that has gone stale lands on the opposite of what the cook
// saw, while a desired state lands on itself however many times it arrives. That is also what makes
// last-write-wins correct here rather than a compromise: every write names one field and one value.
//
// Every statement is parameterized.

import { clearEveryMark } from './shoppingList.js';

// Matches the length the schema caps an id at, so a request cannot get a long string echoed back in
// a refusal.
const INGREDIENT_ID_MAX = 32;

// Matches the length aisles.js caps an Aisle id at, for the same reason INGREDIENT_ID_MAX does.
const AISLE_ID_MAX = 32;

const PANTRY_CHECKLIST_QUERY = `
  select id, name, in_pantry as "inPantry"
  from ingredients
  where not staple
  order by name, id
`;

const STAPLES_QUERY = `
  select id, name
  from ingredients
  where staple
  order by name, id
`;

// Every Ingredient the app knows, Staples included, for the bulk Aisle-filing view on Settings: the
// initial sort of a whole kitchen happens in one sitting rather than one shopping trip at a time.
// Pantry membership is not read here - it is already the Pantry checklist's to carry, and repeating
// it would be two answers to "is this in the Pantry" that a write to one could leave disagreeing
// with the other.
const INGREDIENTS_QUERY = `
  select id, name, aisle_id as "aisleId", staple
  from ingredients
  order by name, id
`;

// The `not staple` guard is the rule rather than a nicety: a Staple that carried Pantry membership
// would be a tick nobody could see or clear.
const SET_PANTRY = `
  update ingredients
  set in_pantry = $2
  where id = $1 and not staple
  returning id
`;

const SET_STAPLE = `
  update ingredients
  -- Becoming a Staple gives up Pantry membership rather than keeping it underneath, where unmarking
  -- would hand back a tick the cook never chose. Unmarking leaves membership alone.
  set staple = $2, in_pantry = in_pantry and not $2
  where id = $1
  returning id
`;

const SET_GOT_IT = `
  update ingredients
  set got_it = $2
  where id = $1
`;

const SET_AISLE = `
  update ingredients
  set aisle_id = $2
  where id = $1
`;

const FIND_INGREDIENT = 'select name, staple from ingredients where id = $1';

// Raised when the id sent names no row in aisles: the foreign key is what refuses it, and matching
// it by name rather than by code alone is the lesson aisles.js and recipes.js both record, so a
// 23503 raised by anything else is never turned into a message about an Aisle that was never named.
const FOREIGN_KEY_VIOLATION = '23503';
const UNKNOWN_AISLE = 'ingredients_aisle_id_fkey';

const namesNoAisle = (cause) =>
  cause.code === FOREIGN_KEY_VIOLATION && cause.constraint === UNKNOWN_AISLE;

export const pantryEntrySchema = {
  type: 'object',
  required: ['id', 'name', 'inPantry'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    inPantry: { type: 'boolean' },
  },
};

export const stapleSchema = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
  },
};

// Every Ingredient, for the bulk Aisle-filing view. `aisleId` matches the Shopping List entry's own
// field - a reference or null, never text - so the same picker component reads either shape. Pantry
// membership is deliberately absent: additionalProperties false is what keeps a column added to this
// query later from reaching the wire unannounced, and there is nothing here for it to duplicate
// anyway, since that state already has a home in `pantryEntrySchema`.
export const ingredientSchema = {
  type: 'object',
  required: ['id', 'name', 'aisleId', 'staple'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    aisleId: { type: ['string', 'null'] },
    staple: { type: 'boolean' },
  },
};

const ingredientParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', maxLength: INGREDIENT_ID_MAX } },
};

const pantryBody = {
  type: 'object',
  required: ['inPantry'],
  additionalProperties: false,
  properties: { inPantry: { type: 'boolean' } },
};

const stapleBody = {
  type: 'object',
  required: ['staple'],
  additionalProperties: false,
  properties: { staple: { type: 'boolean' } },
};

const gotItBody = {
  type: 'object',
  required: ['gotIt'],
  additionalProperties: false,
  properties: { gotIt: { type: 'boolean' } },
};

// A reference now, not text: the Aisle an Ingredient is filed under is one of the managed rows
// aisles.js maintains or nothing, never a spelling a cook typed. Null clears it. The id itself is
// never trimmed or normalized here - it either names a row or it does not, and the foreign key is
// what decides which.
const aisleBody = {
  type: 'object',
  required: ['aisleId'],
  additionalProperties: false,
  properties: { aisleId: { type: ['string', 'null'], maxLength: AISLE_ID_MAX } },
};

/** The Ingredients a cook is asked to tick. */
export async function readPantryChecklist(db) {
  const { rows } = await db.query(PANTRY_CHECKLIST_QUERY);
  return rows;
}

/** The Ingredients assumed always on hand, which the checklist leaves out. */
export async function readStaples(db) {
  const { rows } = await db.query(STAPLES_QUERY);
  return rows;
}

/** Every Ingredient the app knows, Staples included, for the bulk Aisle-filing view on Settings. */
export async function readIngredients(db) {
  const { rows } = await db.query(INGREDIENTS_QUERY);
  return rows;
}

const missingIngredient = (id) => ({ code: 404, message: `There is no Ingredient ${id}.` });

/**
 * Why a Pantry write matched no row. One extra query, and only on the path that is already going to
 * refuse, so the ordinary tick stays a single statement.
 */
async function explainPantryRefusal(db, id) {
  const { rows } = await db.query(FIND_INGREDIENT, [id]);
  if (rows.length === 0) return missingIngredient(id);
  return {
    code: 400,
    message: `${rows[0].name} is a Staple, which is assumed on hand rather than ticked into the Pantry.`,
  };
}

/**
 * Sets one field on one Ingredient, and answers 404 when there is no such Ingredient to set it on.
 * The row count is the whole test: these statements match on the primary key, so matching nothing
 * means the id names nothing.
 *
 * The Pantry write does not go through here. It can miss for a second reason - the Ingredient is a
 * Staple - and telling the two apart is worth the extra query it costs on the path already refusing.
 */
async function setIngredientField(app, reply, statement, [id, value]) {
  const { rowCount } = await app.db.query(statement, [id, value]);

  if (rowCount === 0) {
    const refusal = missingIngredient(id);
    return reply.code(refusal.code).send({ message: refusal.message });
  }

  return reply.code(204).send();
}

export function registerIngredientRoutes(app) {
  app.put(
    '/api/ingredients/:id/pantry',
    { schema: { params: ingredientParams, body: pantryBody } },
    async (request, reply) => {
      const { id } = request.params;
      const { rowCount } = await app.db.query(SET_PANTRY, [id, request.body.inPantry]);

      if (rowCount === 0) {
        const refusal = await explainPantryRefusal(app.db, id);
        return reply.code(refusal.code).send({ message: refusal.message });
      }

      return reply.code(204).send();
    },
  );

  app.put(
    '/api/ingredients/:id/staple',
    { schema: { params: ingredientParams, body: stapleBody } },
    async (request, reply) =>
      setIngredientField(app, reply, SET_STAPLE, [request.params.id, request.body.staple]),
  );

  // Nothing comes back from either of these, for the reason the Selected Recipe write returns
  // nothing: the Shopping List they change is derived, so any rollup answered from a write would be
  // stale the moment a second phone touched anything. The client reads it from the next /api/state.
  app.put(
    '/api/ingredients/:id/got-it',
    { schema: { params: ingredientParams, body: gotItBody } },
    async (request, reply) =>
      setIngredientField(app, reply, SET_GOT_IT, [request.params.id, request.body.gotIt]),
  );

  app.put(
    '/api/ingredients/:id/aisle',
    { schema: { params: ingredientParams, body: aisleBody } },
    async (request, reply) => {
      const { id } = request.params;
      const { aisleId } = request.body;
      try {
        return await setIngredientField(app, reply, SET_AISLE, [id, aisleId]);
      } catch (cause) {
        if (namesNoAisle(cause)) {
          return reply.code(400).send({ message: `There is no Aisle ${aisleId}.` });
        }
        throw cause;
      }
    },
  );

  // Named for the cook's action rather than for the column it writes, because "clear the marks off
  // my shopping list" is the thing being asked for and Got It is defined against a Shopping List
  // entry. It lives in this file because the mark is a property of the Ingredient, which is what
  // lets it survive the list being derived again.
  //
  // DELETE rather than a POST, so the method says what a second one does: clearing marks that are
  // already clear leaves the same state, and a retry after a dropped response cannot overshoot.
  //
  // No control on any page sends this any more: the cook's end-of-trip button is Done Shopping,
  // which clears the marks and deselects the Recipes together (see shoppingList.js). This survives
  // for the Seed recording and for scripts that clear marks without ending a trip, which is why the
  // clearing itself is a function shared with Done Shopping rather than a second copy of one
  // statement that would then be free to drift.
  app.delete('/api/shopping-list/got-it', async (request, reply) => {
    await clearEveryMark(app.db);
    return reply.code(204).send();
  });
}
