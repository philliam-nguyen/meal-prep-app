// The store's sections, in the order the cook walks them.
//
// Aisle was free text on the Ingredient, so "Produce", "produce" and "Veg" were three sections, and
// nothing about the text said which came first in the store. This is the managed list that replaces
// that: a row per section with a name nobody can spell two ways, and a position that says where in
// the walk it comes.
//
// Position is the API's alone. A client sends the order it wants as the full list of ids and never
// a number, so there is no arrangement where two clients disagree about what position 3 means, and
// no client has to know that the list is dense.
//
// Every statement is parameterized.

import { AISLE_MAX } from '@meal-prep/shared';

// Matches the length the schema caps an id at, so a request cannot get a long string echoed back in
// a refusal.
const AISLE_ID_MAX = 32;

// The absolute ceiling on Aisle rows (ADR-0001), and the only guardrail this file adds. A store the
// cook walks has tens of sections, so a hundred is far past any real walk and still bounds what a
// scripted visitor to the Demo Variant can cost. A constant rather than a setting, for the reason
// the Ingredient ceiling is derived rather than configured: no wrapper has an opinion about it, and
// a limit nobody sets is a limit nobody can get wrong.
const AISLES_MAX = 100;

// In walk order, which is the only order this list has ever wanted. Position is not on the wire:
// the array is the order, so a client has nothing to sort by and nothing to send back.
const AISLES_QUERY = `
  select id, name
  from aisles
  order by position
`;

// Serializes every write that decides a position against every other one. Position is dense, so
// each of them reads the walk and then rewrites part of it: two adds arriving together would both
// read the same last place and both claim it, and the deferred constraint would then refuse one of
// them at commit with a violation nobody asked a cook about. The lock is advisory and held only for
// the transaction, so it orders these writes without standing in the way of any other, and these
// writes are human-paced.
//
// The key is arbitrary and shared by nothing else. recipes.js takes its own for the row caps; the
// two never contend, because no request writes a Recipe and a walk.
const WALK_LOCK_KEY = 517_339;
const LOCK_THE_WALK = 'select pg_advisory_xact_lock($1)';

// A new section goes to the end of the walk. `coalesce` is what makes the first one land at 1 on an
// empty list rather than at null.
//
// The ceiling rides in the statement rather than in a count the handler takes first, so the count
// and the position are one read of the table rather than two that could disagree. What makes both
// of them still true at commit is the lock above, taken before this runs.
const INSERT_AISLE = `
  insert into aisles (name, position)
  select $1, coalesce(max(position), 0) + 1
  from aisles
  having count(*) < $2
  returning id, name
`;

// Every id this instance holds. Read under the walk lock, so the set the request is checked against
// cannot change between the check and the rewrite.
const AISLE_IDS_QUERY = 'select id from aisles';

// The whole walk in one statement. `with ordinality` numbers the ids in the order they arrived,
// which is exactly the position each Aisle is asking for, so nothing here has to loop or count.
// One statement also means the deferred unique constraint on position is the only thing standing
// between two sections and one place in the walk, and it is checked when the transaction commits.
const REWRITE_POSITIONS = `
  update aisles a
  set position = ordered.position
  from (
    select id, ordinality as position
    from unnest($1::text[]) with ordinality as t(id, ordinality)
  ) ordered
  where a.id = ordered.id and a.position is distinct from ordered.position
`;

// Deleting returns the place the section held, because the walk has to close up behind it: the
// statement below shifts everything after that place down by one, which is what keeps position
// dense and the next added section at the end of the walk rather than in the gap.
//
// `and not protected` for the reason RENAME_AISLE carries it: a seeded Aisle refuses a delete under
// the demo guardrails, the same way a seeded Recipe does.
const DELETE_AISLE = `
  delete from aisles
  where id = $1 and not protected
  returning position
`;

// One statement rather than a renumber of the whole list, and it relies on the deferred unique
// constraint: the rows pass through each other's positions on the way down, and only the state at
// commit has to be one section per place.
const CLOSE_THE_GAP = `
  update aisles
  set position = position - 1
  where position > $1
`;

// The one uniqueness rule this table has, so a 23505 raised by anything else is not turned into a
// message about a name. Matching the constraint by name rather than only the code is the lesson
// recipes.js records: the id generator once collided on the primary key and a cook was told to look
// for a duplicate that was not there.
const UNIQUE_VIOLATION = '23505';
const DUPLICATE_AISLE_NAME = 'aisles_canonical_name_key';

const namesAnAisleTwice = (cause) =>
  cause.code === UNIQUE_VIOLATION && cause.constraint === DUPLICATE_AISLE_NAME;

// The name goes and the place in the walk stays: renaming is fixing a spelling, not re-walking the
// store. No "returning" beyond the row itself, which the response is assembled from so a renamed
// Aisle and a listed one cannot describe the same row differently.
//
// `and not protected` is the same guard recipes.js puts on its own update: a seeded Aisle refuses a
// rename under the demo guardrails (ADR-0001), and the Homelab Variant never sets the flag, so it is
// inert there rather than conditional (ADR-0002).
const RENAME_AISLE = `
  update aisles
  set name = $2
  where id = $1 and not protected
  returning id, name
`;

// The name the duplicate collided with, so the refusal names the Aisle that is already there rather
// than the spelling the cook just tried. Only read on the path that is already refusing.
const FIND_AISLE_BY_NAME = 'select name from aisles where lower(btrim(name)) = lower(btrim($1))';

// Only read once a write has already matched no row, so the ordinary rename or delete stays on one
// statement and only a refusal pays for the explanation - the same shape recipes.js's FIND_RECIPE
// and explainRefusal take, for the same reason: telling "there is no such Aisle" apart from "there is
// one, and it is Protected" needs a second read that names it.
const FIND_AISLE = 'select name, protected from aisles where id = $1';

export const aisleSchema = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
  },
};

// The same cap the free-text Aisle carried, from the same constant, because it is the same thing
// written on the same shelf edge. `minLength` refuses an empty box here rather than reading it as a
// clear the way the per-Ingredient write does: an Aisle with no name is a heading nobody can read.
const aisleNameBody = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: { name: { type: 'string', minLength: 1, maxLength: AISLE_MAX } },
};

// The full walk, in the order the cook wants it, and no positions: the array is the order. A
// partial list is refused rather than half-applied, because the Aisles it left out would be left at
// positions nobody chose.
const aisleOrderBody = {
  type: 'object',
  required: ['ids'],
  additionalProperties: false,
  properties: {
    ids: {
      type: 'array',
      maxItems: AISLES_MAX,
      items: { type: 'string', maxLength: AISLE_ID_MAX },
    },
  },
};

const aisleParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', maxLength: AISLE_ID_MAX } },
};

/**
 * What a name a cook typed is worth storing as. Trimmed the way an Ingredient name is, because one
 * section of the store must not arrive as two over a space nobody can see.
 */
const normalizeName = (name) => name.trim();

/**
 * The refusal for a name another Aisle already holds. It names the Aisle that is there, which is the
 * half the cook cannot see: they typed the other spelling.
 */
async function duplicateRefusal(db, name) {
  const { rows } = await db.query(FIND_AISLE_BY_NAME, [name]);
  return { message: `There is already an Aisle called ${rows[0]?.name ?? normalizeName(name)}.` };
}

/** The store's sections in walk order. */
export async function readAisles(db) {
  const { rows } = await db.query(AISLES_QUERY);
  return rows;
}

/**
 * Why a write naming an Aisle matched no row: either there is no such Aisle, or there is one that is
 * Protected. Mirrors recipes.js's explainRefusal, for the same reason: Protected is the one refusal
 * on these two routes that is not about the request itself, and the guarded statement's row count
 * alone cannot say which of the two happened.
 */
async function explainAisleRefusal(db, id) {
  const { rows } = await db.query(FIND_AISLE, [id]);
  if (rows.length === 0) return { code: 404, message: `There is no Aisle ${id}.` };
  return {
    code: 403,
    message: `${rows[0].name} is Protected, so it cannot be renamed or removed.`,
  };
}

/**
 * Runs one write that decides a position, inside a transaction and behind the walk lock, and rolls
 * back if it does not finish. Every such write goes through here, because the lock only orders them
 * against each other if all of them take it.
 */
async function writingTheWalk(app, work) {
  const client = await app.db.connect();
  try {
    await client.query('begin');
    await client.query(LOCK_THE_WALK, [WALK_LOCK_KEY]);

    const answer = await work(client);

    await client.query('commit');
    return answer;
  } catch (cause) {
    await client.query('rollback');
    throw cause;
  } finally {
    client.release();
  }
}

/**
 * The half the add and the rename share: a trimmed name, the refusal for one that trimmed away to
 * nothing, and the conflict for one another Aisle already holds. Written once so the two cannot
 * disagree about which names a cook may give a section of the store.
 *
 * `write` returns the row it wrote, or nothing where the id named no Aisle.
 */
async function writeAisleName(app, reply, rawName, write) {
  const name = normalizeName(rawName);
  // The cap is on what the request carried and this is on what is left of it, because a name of
  // nothing but spaces passes minLength and is still a heading with nothing in it.
  if (name === '') {
    return reply.code(400).send({ message: 'An Aisle needs a name.' });
  }

  try {
    return await write(name);
  } catch (cause) {
    if (namesAnAisleTwice(cause)) {
      return reply.code(409).send(await duplicateRefusal(app.db, name));
    }
    throw cause;
  }
}

/**
 * Whether the ids sent are exactly the Aisles this instance holds, each named once. Anything else -
 * one left out, one named twice, one that is not here - describes a walk that is not this store's,
 * and is refused rather than applied to whichever part of it matched.
 */
const isTheWholeWalk = (sent, held) =>
  sent.length === held.size &&
  new Set(sent).size === sent.length &&
  sent.every((id) => held.has(id));

export function registerAisleRoutes(app) {
  // Beside the `aisles` the state response carries rather than instead of it. The app reads the
  // whole first paint in one request and never asks here; what does is anything holding an Aisle id
  // and nothing else - the Seed loader reading back what it has just created, an operator filing
  // Ingredients through the API.
  app.get(
    '/api/aisles',
    { schema: { response: { 200: { type: 'array', items: aisleSchema } } } },
    async () => readAisles(app.db),
  );

  app.post(
    '/api/aisles',
    { schema: { body: aisleNameBody, response: { 201: aisleSchema } } },
    async (request, reply) =>
      writeAisleName(app, reply, request.body.name, async (name) => {
        const added = await writingTheWalk(app, async (client) => {
          const { rows } = await client.query(INSERT_AISLE, [name, AISLES_MAX]);
          return rows[0];
        });

        // No row means the `having` refused it, which is the ceiling and nothing else: the id is
        // minted here, so there is no id that could have named nothing.
        if (!added) {
          return reply.code(409).send({
            message: `This instance has room for ${AISLES_MAX} Aisles and is holding all of them.`,
          });
        }

        return reply.code(201).send(added);
      }),
  );

  app.put(
    '/api/aisles/:id',
    { schema: { params: aisleParams, body: aisleNameBody, response: { 200: aisleSchema } } },
    async (request, reply) =>
      writeAisleName(app, reply, request.body.name, async (name) => {
        const { id } = request.params;
        const { rows } = await app.db.query(RENAME_AISLE, [id, name]);

        // No row means either of two things the guard above folds together: there is no such Aisle,
        // or there is one that is Protected. explainAisleRefusal is what tells them apart.
        if (rows.length === 0) {
          const refusal = await explainAisleRefusal(app.db, id);
          return reply.code(refusal.code).send({ message: refusal.message });
        }

        return reply.code(200).send(rows[0]);
      }),
  );

  // One request and one transaction, so the walk a cook rearranged either lands whole or not at all.
  // The client sends ids and never numbers: position is dense and this file's alone, and two phones
  // that both sent numbers would have to agree on what position 3 meant.
  //
  // A static path beside `/api/aisles/:id`, which Fastify prefers over the parameter. Ids are minted
  // as A001 upward, so no Aisle can ever be called "order" and be shadowed by it.
  app.put('/api/aisles/order', { schema: { body: aisleOrderBody } }, async (request, reply) => {
    const { ids } = request.body;

    const isThisStore = await writingTheWalk(app, async (client) => {
      const { rows } = await client.query(AISLE_IDS_QUERY);
      if (!isTheWholeWalk(ids, new Set(rows.map((row) => row.id)))) return false;

      await client.query(REWRITE_POSITIONS, [ids]);
      return true;
    });

    if (!isThisStore) {
      return reply
        .code(409)
        .send({ message: 'That is not the whole list of Aisles. Reload and try again.' });
    }

    // Nothing comes back, for the reason the Selected Recipe write returns nothing: the caller
    // already knows the order it sent, and everything this changes is read from the next state.
    return reply.code(204).send();
  });

  // Nothing comes back, and none is wanted: what a caller would do with a copy of an Aisle that no
  // longer exists is nothing.
  //
  // A removal is never refused for what is filed under the section: `ingredients.aisle_id` references
  // this table `on delete set null`, so an Ingredient filed here becomes unassigned rather than the
  // removal being blocked. Tidying the list must not be the thing that cannot be done, and the
  // initial sort is being done with an agent, so a mistaken removal is cheap to recover from.
  app.delete('/api/aisles/:id', { schema: { params: aisleParams } }, async (request, reply) => {
    const { id } = request.params;

    // One transaction, so the walk is never seen with a gap in it where the removed section was.
    const removed = await writingTheWalk(app, async (client) => {
      const { rows } = await client.query(DELETE_AISLE, [id]);
      if (rows.length === 0) return false;

      await client.query(CLOSE_THE_GAP, [rows[0].position]);
      return true;
    });

    if (!removed) {
      const refusal = await explainAisleRefusal(app.db, id);
      return reply.code(refusal.code).send({ message: refusal.message });
    }

    return reply.code(204).send();
  });
}
