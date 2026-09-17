// The walk an up or down button asks the API for.
//
// Reordering is one request carrying the full ordered list of Aisle ids, and the API rewrites every
// position from it. So a button that moves one section one place has to produce the whole walk, not
// the place it wants: no position number ever leaves the browser, and there is one description of
// the order rather than a client's and a server's that can disagree.
//
// No JSX, no framework, no render: this is the arithmetic behind the two buttons, which is why it
// sits beside freshness.js as a module a test can drive on its own.

/**
 * The walk with one Aisle moved `step` places, as the list of ids the reorder endpoint takes, or
 * null where there is nowhere to move it - the first section sent up, the last sent down, or an
 * Aisle that has since left the list.
 *
 * Null rather than the unchanged walk, because the two mean different things to the caller: one is
 * a request worth sending and the other is a button that should not have fired.
 */
export function walkAfterMoving(aisles, aisleId, step) {
  const from = aisles.findIndex((aisle) => aisle.id === aisleId);
  const to = from + step;
  if (from === -1 || to < 0 || to >= aisles.length) return null;

  const ids = aisles.map((aisle) => aisle.id);
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}
