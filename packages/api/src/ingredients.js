// The two lists a cook curates: the Pantry checklist they tick, and the Staples they have stopped
// being asked about. They are separate here rather than one collection with a flag, because
// "Staples never appear in the Pantry checklist" is then a property of this file that a test can
// hold to, instead of a filter in the frontend that nothing checks.
//
// Both writes send the value they want rather than asking for a flip. One Pantry is shared by two
// phones, so a flip sent from a screen that has gone stale lands on the opposite of what the cook
// saw, while a desired state lands on itself however many times it arrives. That is also what makes
// last-write-wins correct here rather than a compromise: every write names one field and one value.
//
// Every statement is parameterized.

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
    async (request, reply) => {
      const { id } = request.params;
      const { rowCount } = await app.db.query(SET_STAPLE, [id, request.body.staple]);

      if (rowCount === 0) {
        const refusal = missingIngredient(id);
        return reply.code(refusal.code).send({ message: refusal.message });
      }

      return reply.code(204).send();
    },
  );
}
