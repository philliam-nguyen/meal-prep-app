// The shopping trip as a whole, rather than any one thing on it. Two rules live here, and they are
// the same rule seen from two ends: a Got It mark belongs to an Ingredient that is on the Shopping
// List, so a mark whose Ingredient has left the list is not a mark any more.
//
// The list itself is derived on every read and stored nowhere, so there is nothing here to delete.
// What a trip is made of is its two inputs: the Selected Recipes that put Ingredients on the list,
// and the marks the cook made walking it. Ending a trip is removing both.
//
// Every statement is parameterized. Nothing on this path builds SQL from a string.

// The `where selected` guard means a request touches only the rows it changes, so ending a trip
// with two Selected Recipes does not rewrite every Recipe in the collection to say what it already
// said. The same guard is what makes a second request free rather than merely harmless.
const DESELECT_EVERY_RECIPE = `
  update recipes
  set selected = false
  where selected
`;

// Every mark, not the marks on whatever the list derives to right now. An Ingredient that dropped
// off the list carrying a tick is exactly the stale mark that comes back pre-ticked weeks later,
// and Done Shopping is the cook saying the trip is over rather than saying which entries were on
// screen.
//
// The `where got_it` guard means a request touches only the rows it changes, so a trip with two
// ticks does not rewrite every Ingredient in the database to say what it already said.
const CLEAR_EVERY_MARK = `
  update ingredients
  set got_it = false
  where got_it
`;

// The mark on an Ingredient no Selected Recipe calls for any more. Written as "not on the list"
// rather than "left the list because of this write", because those are the same set once the write
// has landed and only the first can be asked without knowing what the list held a moment ago. A
// mark that was already stale goes with it, which is the same tick this rule exists to remove.
//
// The `where got_it` guard is doing the same work it does above: only rows that change are written.
const CLEAR_MARKS_OFF_THE_LIST = `
  update ingredients
  set got_it = false
  where got_it
    and not exists (
      select 1
      from recipe_ingredients ri
      join recipes r on r.id = ri.recipe_id
      where ri.ingredient_id = ingredients.id and r.selected
    )
`;

/**
 * Clears every Got It mark there is.
 *
 * Two callers, which is why it is a function rather than a statement each of them keeps its own
 * copy of: Done Shopping below, and the standalone clear endpoint that survives for the Seed
 * recording. Takes anything that can run a statement, so Done Shopping can hand it the client its
 * transaction is running on and the standalone endpoint can hand it the pool.
 */
export async function clearEveryMark(db) {
  await db.query(CLEAR_EVERY_MARK);
}

/**
 * Clears the Got It mark on every Ingredient that no longer belongs to any Selected Recipe.
 *
 * Takes a client rather than the pool, because every caller runs it in the same transaction as the
 * write that took the Ingredients off the list: a deselect that committed without this would leave
 * a mark on an Ingredient that is no longer on the list, which is the state this rule exists to
 * make unreachable.
 */
export async function clearMarksOffTheList(client) {
  await client.query(CLEAR_MARKS_OFF_THE_LIST);
}

export function registerShoppingListRoutes(app) {
  // Done Shopping: the trip is over, and next week starts from nothing. One endpoint rather than
  // two client calls, so a phone that loses its connection in the car park cannot leave a list half
  // cleared - Ingredients still on it wearing ticks from a shop that is finished. The two writes
  // are one transaction for the same reason.
  //
  // DELETE, and DELETE of the list rather than of anything under it, because that is what a cook
  // means: the list is gone. The method also says what a second request does, which matters here
  // more than on most writes, since the retry after a dropped response is the ordinary case.
  //
  // Nothing comes back, for the reason every other write here answers with nothing: the Shopping
  // List is derived, so a rollup answered from a write would be stale the moment a second phone
  // touched anything. The client reads what happened from the next /api/state.
  app.delete('/api/shopping-list', async (request, reply) => {
    const client = await app.db.connect();
    try {
      await client.query('begin');
      await client.query(DESELECT_EVERY_RECIPE);
      await clearEveryMark(client);
      await client.query('commit');
    } catch (cause) {
      await client.query('rollback');
      throw cause;
    } finally {
      client.release();
    }

    return reply.code(204).send();
  });
}
