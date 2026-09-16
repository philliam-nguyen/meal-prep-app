// The Shopping List as a cook walks it, rather than as the API answered it: grouped under the
// Aisle headings from the walk, in the order the walk carries them, with what has no Aisle last
// under a group of its own. Pure over the two arrays the state response already carries - the flat
// list and the walk - the same way splitByMembership is pure over the Pantry checklist. Run again
// on every optimistic Got It tick and every Aisle filed from its picker, not asked for again from
// the server, because grouping is arithmetic over what already arrived rather than a fact the
// server alone knows.

/**
 * The list grouped by Aisle. One entry per group in `aisles`' own order, and a final group for
 * whatever has no Aisle - including an Aisle id the walk no longer carries, which is what a stale
 * screen looks like the moment an Aisle is removed out from under it. An Aisle nothing is filed
 * under contributes no group at all, so the walk on screen is only as long as what is being bought,
 * and the unassigned group is the same: absent when everything has a home.
 *
 * Within a group, entries not yet Got It come first and Got It entries sink to the bottom, each
 * half kept in the order it arrived in - the same rule the ungrouped list already applied over the
 * whole thing, run once per group instead of once over the top.
 */
export function groupByAisle(shoppingList, aisles) {
  const byAisleId = new Map(aisles.map(aisle => [aisle.id, []]));
  const unassigned = [];

  for (const entry of shoppingList) {
    const bucket = entry.aisleId != null ? byAisleId.get(entry.aisleId) : undefined;
    (bucket ?? unassigned).push(entry);
  }

  const sunk = entries => [...entries.filter(e => !e.gotIt), ...entries.filter(e => e.gotIt)];

  const groups = aisles
    .map(aisle => ({ aisleId: aisle.id, name: aisle.name, entries: sunk(byAisleId.get(aisle.id)) }))
    .filter(group => group.entries.length > 0);

  if (unassigned.length > 0) {
    groups.push({ aisleId: null, name: null, entries: sunk(unassigned) });
  }

  return groups;
}
