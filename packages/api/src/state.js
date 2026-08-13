// Everything the first paint needs, in one query. The Sheets-era client opened four parallel
// spreadsheet calls on load and stitched the results together in the browser.
//
// Recipe Ingredients nest inside their Recipe because a Recipe Ingredient is meaningless on its
// own: it exists only as part of one Recipe. Ingredient does not nest, because it has an identity
// of its own that two Recipes share.

const recipesQuery = (where = '') => `
  select
    r.id,
    r.name,
    r.type,
    r.card_url as "cardUrl",
    r.selected,
    r.protected,
    coalesce(
      (
        select json_agg(
          json_build_object(
            'ingredientId', i.id,
            'name', i.name,
            -- pg hands numeric back as a string to protect precision it does not know is safe to
            -- lose. Quantities here are cooking measures, so a double is exact enough and keeps
            -- an unquantified Recipe Ingredient as null rather than as the string "0".
            'quantity', ri.quantity::double precision,
            'unit', ri.unit
          )
          order by i.name
        )
        from recipe_ingredients ri
        join ingredients i on i.id = ri.ingredient_id
        where ri.recipe_id = r.id
      ),
      '[]'::json
    ) as ingredients
  from recipes r
  ${where}
  -- By name, because this is a browse list and the cook is looking for one they half-remember.
  -- Ordering by id would sort R1000 above R999, and the extract carries whatever ids the
  -- spreadsheet held rather than a format this could rely on (ADR-0006).
  order by r.name, r.id
`;

const RECIPES_QUERY = recipesQuery();

// The write path answers with this rather than assembling a reply from what it just inserted, so a
// created Recipe and a browsed one cannot describe the same row differently.
const RECIPE_BY_ID_QUERY = recipesQuery('where r.id = $1');

const recipeIngredient = {
  type: 'object',
  required: ['ingredientId', 'name', 'quantity', 'unit'],
  additionalProperties: false,
  properties: {
    ingredientId: { type: 'string' },
    name: { type: 'string' },
    // Null is unquantified, "to taste", and has to survive the wire as null. A zero here would be
    // a lie that sums.
    quantity: { type: ['number', 'null'] },
    unit: { type: 'string' },
  },
};

export const recipeSchema = {
  type: 'object',
  required: ['id', 'name', 'type', 'cardUrl', 'selected', 'protected', 'ingredients'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    cardUrl: { type: ['string', 'null'] },
    selected: { type: 'boolean' },
    protected: { type: 'boolean' },
    ingredients: { type: 'array', items: recipeIngredient },
  },
};

/** Fastify serializes the response through this, so a column added later stays off the wire. */
export const stateResponse = {
  type: 'object',
  required: ['recipes'],
  additionalProperties: false,
  properties: {
    recipes: { type: 'array', items: recipeSchema },
  },
};

/**
 * Reads the first-paint payload. Search and Recipe Type filtering are deliberately absent: the
 * whole collection travels in one response and the client narrows it, so a keystroke in the search
 * box costs no request.
 */
export async function readState(db) {
  const { rows } = await db.query(RECIPES_QUERY);
  return { recipes: rows };
}

/** One Recipe in the same shape the browse list gives it. */
export async function readRecipe(db, id) {
  const { rows } = await db.query(RECIPE_BY_ID_QUERY, [id]);
  return rows[0];
}
