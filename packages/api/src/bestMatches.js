// The match rule, defined fresh in SQL. The spreadsheet formulas in columns D, E and F of the
// `Ingredients Match` tab were never in the repository, so there was nothing to recover and nothing
// to stay faithful to.
//
// Rank by the absolute count of Missing Ingredients, ascending, because the question the feature
// answers is how short the trip to the store is, and one missing item is one stop whether the
// Recipe needs four Ingredients or fourteen. Percentage complete would put a Recipe missing two of
// fourteen above one missing one of four, which is the wrong way round for someone deciding whether
// to put their shoes on.
//
// This is the only implementation. The spreadsheet had one and the client had another, which is how
// they came to disagree.

// A cook scans this on a phone to decide what to cook tonight, so the twenty shortest trips are the
// whole of the useful answer and the tail is noise. It is also the ceiling on how much work an
// anonymous visitor can ask the Demo Variant for in one read.
export const BEST_MATCHES_MAX = 20;

const BEST_MATCHES_QUERY = `
  with tally as (
    select
      ri.recipe_id,
      -- Membership, never quantity. The Pantry answers whether a food is in the kitchen, so an
      -- Ingredient is present or absent and never "enough".
      --
      -- A Staple counts on neither side. It is not something the cook ticks, and it is not something
      -- a Recipe can be short of.
      count(*) filter (where i.in_pantry and not i.staple) as in_pantry,
      count(*) filter (where not i.in_pantry and not i.staple) as missing_count,
      -- No sentinel. A Recipe with nothing Missing gets an empty list, which reads as cookable
      -- right now without anyone having to know a magic string.
      coalesce(
        json_agg(i.name order by i.name) filter (where not i.in_pantry and not i.staple),
        '[]'::json
      ) as missing
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
    group by ri.recipe_id
  )
  select
    r.id as "recipeId",
    t.missing
  from tally t
  join recipes r on r.id = t.recipe_id
  -- Two ways in, and a Recipe needs one of them.
  --
  -- Pantry overlap is the ordinary one: the cook owns at least one thing this Recipe calls for.
  -- Without it the answer fills with the whole collection the moment anything is ticked.
  --
  -- Nothing Missing is the second, and it exists for the Recipe whose Ingredients are all Staples.
  -- Overlap alone would hide it, because a Staple is never in the Pantry, even though it is the one
  -- Recipe the cook can start this minute. Note that this is deliberately not "the Recipe contains a
  -- Staple": having the salt is not having the soup.
  where t.in_pantry > 0 or t.missing_count = 0
  order by t.missing_count, r.name, r.id
  limit $1
`;

export const bestMatchSchema = {
  type: 'object',
  required: ['recipeId', 'missing'],
  additionalProperties: false,
  properties: {
    recipeId: { type: 'string' },
    // Names rather than ids: this list is read, not joined. The client already holds every Recipe
    // from the same response, so the Recipe itself needs no repeating here.
    missing: { type: 'array', items: { type: 'string' } },
  },
};

/** Every Recipe worth considering, shortest trip to the store first. */
export async function readBestMatches(db) {
  const { rows } = await db.query(BEST_MATCHES_QUERY, [BEST_MATCHES_MAX]);
  return rows;
}
