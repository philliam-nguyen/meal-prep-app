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

import { AISLE_MAX } from '@meal-prep/shared';

// Matches the length the schema caps an id at, so a request cannot get a long string echoed back in
// a refusal.
const INGREDIENT_ID_MAX = 32;

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
  set aisle = $2
  where id = $1
`;

// Every mark, not the marks on whatever the Shopping List happens to derive to right now. The stale
// tick this exists to answer is exactly the Ingredient that has dropped off the list and will come
// back pre-ticked on the next trip.
//
// The `where got_it` guard means a clear touches only the rows it changes, so a list of two ticks
// does not rewrite every Ingredient in the database to say the same thing twice.
const CLEAR_GOT_IT = `
  update ingredients
  set got_it = false
  where got_it
`;

const FIND_INGREDIENT = 'select name, staple from ingredients where id = $1';

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

// Free text with a length cap and no character allowlist. Store sections are written every way a
// store can think of - "Aisle 12 - Dairy & eggs" - and a set tight enough to be worth enforcing
// would refuse the real ones. The stored-XSS rule that governs the Recipe Card URL does not reach
// here: an Aisle is rendered as text, which React escapes, and never as an href.
//
// Null clears the Aisle. An emptied box is normalized to null below rather than refused, because a
// cook deleting what they typed means the same thing by it.
const aisleBody = {
  type: 'object',
  required: ['aisle'],
  additionalProperties: false,
  properties: { aisle: { type: ['string', 'null'], maxLength: AISLE_MAX } },
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
 * What an Aisle a cook typed is worth storing as. Trimmed, so one section does not arrive as two
 * spellings, and an emptied box becomes null rather than a heading with no name in it.
 */
function normalizeAisle(aisle) {
  const trimmed = aisle?.trim();
  return trimmed ? trimmed : null;
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
    async (request, reply) =>
      setIngredientField(app, reply, SET_AISLE, [
        request.params.id,
        normalizeAisle(request.body.aisle),
      ]),
  );

  // Named for the cook's action rather than for the column it writes, because "clear the marks off
  // my shopping list" is the thing being asked for and Got It is defined against a Shopping List
  // entry. It lives in this file because the mark is a property of the Ingredient, which is what
  // lets it survive the list being derived again.
  //
  // DELETE rather than a POST, so the method says what a second one does: clearing marks that are
  // already clear leaves the same state, and a retry after a dropped response cannot overshoot.
  //
  // Deliberate and nothing else triggers it. Auto-clearing on a change to the Selected Recipes was
  // rejected in the spec: adding a forgotten Recipe mid-trip would wipe the ticks already earned in
  // the store, which is worse than the mark that never resets.
  app.delete('/api/shopping-list/got-it', async (request, reply) => {
    await app.db.query(CLEAR_GOT_IT);
    return reply.code(204).send();
  });
}
