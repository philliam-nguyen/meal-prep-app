// Everything the first paint needs, in one request. The Sheets-era client opened four parallel
// spreadsheet calls on load and stitched the results together in the browser.
//
// Recipe Ingredients nest inside their Recipe because a Recipe Ingredient is meaningless on its
// own: it exists only as part of one Recipe. Ingredient does not nest, because it has an identity
// of its own that two Recipes share.
//
// The Shopping List is derived here on every read and stored nowhere. It was computed twice before
// this — once in a spreadsheet formula, once in the browser — which is two implementations that
// could disagree about what to buy.
//
// Best Matches is derived the same way and for the same reason, and lives in bestMatches.js because
// the match rule is a thing in its own right rather than a shape this payload happens to need.

import { bestMatchSchema, readBestMatches } from './bestMatches.js';
import {
  pantryEntrySchema,
  readPantryChecklist,
  readStaples,
  stapleSchema,
} from './ingredients.js';
import { readVersion } from './version.js';

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

// One entry per Ingredient any Selected Recipe calls for, however many of them call for it, so a
// cook does not walk past the onions twice.
//
// Quantities are summed within each unit and never across them. The Sheets-era client grouped by
// Ingredient name alone and kept the first unit it met, so two cups plus three hundred grams
// rendered as a single number wearing one of the two units. Keying the sum by unit while keeping the
// entry keyed by Ingredient fixes the arithmetic without splitting the entry.
//
// Got It and Aisle are read from the Ingredient itself rather than from anything this derives, which
// is what lets the list be recomputed on every read without losing what the cook marked.
const SHOPPING_LIST_QUERY = `
  with needed as (
    select
      ri.ingredient_id,
      ri.unit,
      -- sum() skips nulls, so an unquantified Recipe Ingredient contributes nothing rather than the
      -- zero the Sheets-era parseFloat(...) || 0 turned it into. A unit every Selected Recipe leaves
      -- unquantified sums to null and is dropped below, so "to taste" never becomes an amount.
      sum(ri.quantity) as quantity
    from recipe_ingredients ri
    join recipes r on r.id = ri.recipe_id
    where r.selected
    group by ri.ingredient_id, ri.unit
  )
  select
    i.id as "ingredientId",
    i.name,
    i.aisle,
    i.got_it as "gotIt",
    coalesce(
      (
        select json_agg(
          -- Cast for the same reason the Recipe Ingredient quantity is cast: pg hands numeric back
          -- as a string, and a cooking measure loses nothing as a double.
          json_build_object('quantity', n.quantity::double precision, 'unit', n.unit)
          order by n.unit
        )
        from needed n
        where n.ingredient_id = i.id and n.quantity is not null
      ),
      '[]'::json
    ) as amounts
  from ingredients i
  -- An Ingredient a Selected Recipe calls for belongs on the list whether or not anything quantified
  -- it, so this asks what is needed rather than what summed to a number.
  where exists (select 1 from needed n where n.ingredient_id = i.id)
  order by i.name, i.id
`;

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

// An amount that reached the list was summed from at least one real quantity, so null cannot appear
// here. That is the difference between this and a Recipe Ingredient, where null is "to taste".
const shoppingListAmount = {
  type: 'object',
  required: ['quantity', 'unit'],
  additionalProperties: false,
  properties: {
    quantity: { type: 'number' },
    unit: { type: 'string' },
  },
};

const shoppingListEntry = {
  type: 'object',
  required: ['ingredientId', 'name', 'aisle', 'gotIt', 'amounts'],
  additionalProperties: false,
  properties: {
    ingredientId: { type: 'string' },
    name: { type: 'string' },
    aisle: { type: ['string', 'null'] },
    gotIt: { type: 'boolean' },
    // Empty when every Selected Recipe leaves this Ingredient unquantified. The cook still has to
    // buy it; nobody can say how much.
    amounts: { type: 'array', items: shoppingListAmount },
  },
};

/** Fastify serializes the response through this, so a column added later stays off the wire. */
export const stateResponse = {
  type: 'object',
  required: ['version', 'recipes', 'shoppingList', 'pantryChecklist', 'staples', 'bestMatches'],
  additionalProperties: false,
  properties: {
    // What the freshness poll compares against. Here rather than left to the client's first poll,
    // because a client that starts by asking the version endpoint has a gap between the two requests
    // where a write can land and be adopted as the baseline, and a change adopted as the baseline is
    // a change that never arrives.
    version: { type: 'string' },
    recipes: { type: 'array', items: recipeSchema },
    shoppingList: { type: 'array', items: shoppingListEntry },
    // Two lists rather than one collection with a flag, so that Staples being absent from the
    // checklist is something this payload states rather than something the frontend remembers.
    pantryChecklist: { type: 'array', items: pantryEntrySchema },
    staples: { type: 'array', items: stapleSchema },
    bestMatches: { type: 'array', items: bestMatchSchema },
  },
};

/**
 * Reads the first-paint payload. Search and Recipe Type filtering are deliberately absent: the
 * whole collection travels in one response and the client narrows it, so a keystroke in the search
 * box costs no request.
 *
 * Several statements rather than one, so they are several snapshots: a toggle landing between them
 * could hand a client a Recipe from before it alongside a Shopping List from after. That is a stale
 * read rather than a conflict, it corrects itself on the next read, and last-write-wins is the model
 * this app is built on.
 *
 * The version is read first and alone, which is the one piece of ordering here that matters. It is
 * the mark the client's poll compares against, so it has to describe a moment no later than the
 * payload around it. Read after these queries, or in parallel with them, it could describe a write
 * the payload missed, and the client would compare against a version it never actually received and
 * sit on stale data until something else changed.
 */
export async function readState(db) {
  const version = await readVersion(db);
  const [recipes, shoppingList, pantryChecklist, staples, bestMatches] = await Promise.all([
    db.query(RECIPES_QUERY),
    db.query(SHOPPING_LIST_QUERY),
    readPantryChecklist(db),
    readStaples(db),
    readBestMatches(db),
  ]);
  return {
    version,
    recipes: recipes.rows,
    shoppingList: shoppingList.rows,
    pantryChecklist,
    staples,
    bestMatches,
  };
}

/** One Recipe in the same shape the browse list gives it. */
export async function readRecipe(db, id) {
  const { rows } = await db.query(RECIPE_BY_ID_QUERY, [id]);
  return rows[0];
}
