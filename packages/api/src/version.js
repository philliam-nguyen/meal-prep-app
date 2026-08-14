// The freshness signal, and the only endpoint written to be asked for over and over. Two phones
// shopping from one list poll it every few seconds, so it answers from a single query and a body of
// a few dozen bytes, and the client refetches real data only when the value it returns moves.

// The timestamp is maintained by the trigger the schema installs, so no write path can forget to
// move it. What the timestamp cannot see is a delete: removing a row that is not the most recently
// touched one leaves the maximum exactly where it was. The row counts alongside it are what close
// that, since every delete takes a row away from one of these three tables.
//
// Not covered: an edit that touches only a Recipe Ingredient's quantity, unit, or which Ingredient
// it points at. recipe_ingredients carries no updated_at of its own, and the trigger on recipes is
// guarded by `when (old.* is distinct from new.*)`, so writing the child rows alone leaves the
// parent's timestamp where it was. Ticket 09 owns the edit path and closes this by writing the
// Recipe row it is editing, which moves that row's timestamp whatever else changed.
const VERSION_QUERY = `
  select
    -- Elapsed time since the epoch rather than a timestamp, so the value the client compares is the
    -- same string whatever timezone either end is set to.
    --
    -- Microseconds because that is the resolution Postgres keeps, and rounding to anything coarser
    -- loses writes: a toggle landing inside the same tick as the read that gave a client its
    -- baseline would produce the same value twice and never reach that client at all.
    (extract(epoch from greatest(
      (select coalesce(max(updated_at), 'epoch'::timestamptz) from recipes),
      (select coalesce(max(updated_at), 'epoch'::timestamptz) from ingredients)
    )) * 1000000)::bigint as "changedAt",
    (select count(*) from recipes) as recipes,
    (select count(*) from ingredients) as ingredients,
    (select count(*) from recipe_ingredients) as "recipeIngredients"
`;

const versionResponse = {
  type: 'object',
  required: ['version'],
  additionalProperties: false,
  properties: { version: { type: 'string' } },
};

/**
 * A value that changes when anything mutable changes and holds still otherwise. Opaque on purpose:
 * the client compares it to the last one it saw and has no business reading anything out of it.
 */
export async function readVersion(db) {
  const {
    rows: [row],
  } = await db.query(VERSION_QUERY);
  return `${row.changedAt}-${row.recipes}-${row.ingredients}-${row.recipeIngredients}`;
}

export function registerVersionRoute(app) {
  app.get('/api/version', { schema: { response: { 200: versionResponse } } }, async () => ({
    version: await readVersion(app.db),
  }));
}
