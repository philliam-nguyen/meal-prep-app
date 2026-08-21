// The approval-gated export back to the spreadsheet (ticket 18).

/**
 * A quantity, a unit and optionally the Ingredient, as a person reads it: "2 cup chickpeas", "300 g", or
 * just "salt" where nobody quantified it.
 *
 * A null quantity is "to taste" and stays absent rather than becoming a zero, which is the same
 * distinction the payload draws and the opposite of what the Sheets-era `parseFloat(...) || 0` did.
 * The comparison is against null rather than falsiness, so a genuine zero would still be written.
 */
const readable = ({ quantity, unit, name }) =>
  [quantity === null || quantity === undefined ? undefined : String(quantity), unit, name]
    .filter((part) => part !== undefined && part !== '')
    .join(' ');

const recipesTab = (recipes) => ({
  title: 'Recipes',
  rows: [
    ['Recipe', 'Recipe Type', 'Ingredients', 'Recipe Card', 'Selected'],
    ...recipes.map((recipe) => [
      recipe.name,
      recipe.type,
      recipe.ingredients.map(readable).join(', '),
      recipe.cardUrl ?? '',
      recipe.selected ? 'Yes' : '',
    ]),
  ],
});

const shoppingListTab = (shoppingList) => ({
  title: 'Shopping List',
  rows: [
    ['Ingredient', 'Amount', 'Aisle', 'Got It'],
    ...shoppingList.map((entry) => [
      entry.name,
      // Joined rather than summed. The quantities arrive already summed within each unit and never
      // across them, and a cell that picked one unit would be the arithmetic state.js records having
      // fixed, written back into the spreadsheet it came from.
      entry.amounts.map(readable).join(' + '),
      entry.aisle ?? '',
      entry.gotIt ? 'Yes' : '',
    ]),
  ],
});

// One tab out of the payload's two lists. They are two because a Staple never appears on the Pantry
// checklist, and that stays visible here as a column rather than being flattened away: a person
// reading this on a phone wants to know the kitchen holds salt as much as they want to know it holds
// chickpeas, and wants to know which of the two they will never be asked to tick.
//
// Sorted by name across both lists, because the payload orders each of them by name separately and
// two runs of names in one column reads as a mistake.
const pantryTab = (pantryChecklist, staples) => ({
  title: 'Pantry',
  rows: [
    ['Ingredient', 'In Pantry', 'Staple'],
    ...[
      ...pantryChecklist.map((entry) => [entry.name, entry.inPantry ? 'Yes' : '', '']),
      ...staples.map((staple) => [staple.name, '', 'Yes']),
    ].sort(([left], [right]) => left.localeCompare(right)),
  ],
});

/**
 * The tabs the spreadsheet would hold, rendered from the first-paint payload.
 *
 * From the payload rather than from queries of its own, for the reason the recorded Seed is a
 * recording rather than a computation (ADR-0009): the Shopping List and the Pantry checklist are
 * derived, and a second implementation of either here could disagree with the app about what to buy.
 * What this file decides is layout, and nothing else.
 *
 * Lossy on purpose. Ids, Recipe Ingredient rows and the Protected mark are all absent, because the
 * target is a copy a person reads on a phone rather than a source anything loads back.
 */
export function exportTabs(state) {
  return [
    recipesTab(state.recipes),
    shoppingListTab(state.shoppingList),
    pantryTab(state.pantryChecklist, state.staples),
  ];
}

/**
 * Names rows by their leftmost cell, and by which occurrence of that name they are when it repeats.
 *
 * Nothing in the schema makes a Recipe name unique the way an Ingredient's identity makes its name
 * unique, so two Recipes may genuinely be called the same thing. Keyed on the name alone, the second
 * of them would be reported as removed on every run and the export would never reach a settled
 * state. One of these per side of the diff, applied in row order, so the two sides agree on which
 * occurrence is which.
 */
function keying() {
  const seen = new Map();
  return (row) => {
    const name = row[0] ?? '';
    const occurrence = (seen.get(name) ?? 0) + 1;
    seen.set(name, occurrence);
    return occurrence === 1 ? name : `${name} (${occurrence})`;
  };
}

// Sheets drops trailing empty cells on the way out, so a row written as three comes back as two.
// Comparing the arrays as they arrive would report every unticked Ingredient as changed on every
// run, which is a diff that never settles and an Operator who stops reading it.
function withoutTrailingBlanks(row) {
  let end = row.length;
  while (end > 0 && (row[end - 1] ?? '') === '') end -= 1;
  return row.slice(0, end);
}

function sameRow(left, right) {
  const [a, b] = [withoutTrailingBlanks(left), withoutTrailingBlanks(right)];
  return a.length === b.length && a.every((cell, index) => cell === b[index]);
}

/**
 * What the Operator is asked to approve: the rows this run would add, remove and change in one tab.
 *
 * Keyed on the leftmost cell rather than on the row number. Every tab is ordered by name, so one new
 * Recipe near the top of the collection would move every row below it and a positional diff would
 * report the whole tab as rewritten. That diff is true and unreadable, and an approval nobody can
 * read is a rubber stamp.
 */
export function diffTab({ title, current, desired }) {
  const keyOfCurrent = keying();
  const keyOfDesired = keying();
  const before = new Map(current.map((row) => [keyOfCurrent(row), row]));
  const added = [];
  const changed = [];
  let unchanged = 0;

  for (const [index, row] of desired.entries()) {
    const key = keyOfDesired(row);
    const was = before.get(key);
    before.delete(key);
    if (!was) added.push({ key, row });
    else if (!sameRow(was, row)) changed.push({ key, before: was, after: row });
    // The header row is layout rather than data, so a matching one is not an unchanged row - counting
    // it would overstate every summary the Operator reads by one.
    else if (index > 0) unchanged += 1;
  }

  const removed = [...before].map(([key, row]) => ({ key, row }));
  return {
    title,
    headers: desired[0] ?? [],
    added,
    removed,
    changed,
    unchanged,
  };
}

/** Whether this tab would be touched at all. An untouched tab is never rewritten. */
export const hasChanges = (diff) =>
  diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

// Long enough for a Recipe name and short enough that a Recipe Card URL does not push the rest of a
// row off the side of a terminal. The Operator is reading this to decide, not to audit.
const CELL_MAX = 60;

const cell = (value = '') =>
  value.length > CELL_MAX ? `${value.slice(0, CELL_MAX - 1)}…` : value;

const rowLine = (mark, row) => `  ${mark} ${row.map(cell).join(' | ')}`;

// Named by their column heading rather than by their position, because "Aisle" is what the Operator
// is deciding about and "column 3" is what they would have to count to find out.
function changedCells({ headers, before, after }) {
  const width = Math.max(before.length, after.length);
  const lines = [];
  for (let index = 0; index < width; index += 1) {
    const [was, now] = [before[index] ?? '', after[index] ?? ''];
    if (was === now) continue;
    lines.push(`      ${headers[index] ?? `column ${index + 1}`}: "${cell(was)}" -> "${cell(now)}"`);
  }
  return lines;
}

/** One tab's diff as the lines the Operator reads before answering. */
export function describeDiff(diff) {
  const counts = [
    `${diff.added.length} added`,
    `${diff.removed.length} removed`,
    `${diff.changed.length} changed`,
    `${diff.unchanged} unchanged`,
  ].join(', ');
  const lines = [`${diff.title}: ${counts}`];
  for (const { row } of diff.added) lines.push(rowLine('+', row));
  for (const { row } of diff.removed) lines.push(rowLine('-', row));
  for (const change of diff.changed) {
    lines.push(`  ~ ${cell(change.key)}`);
    lines.push(...changedCells({ headers: diff.headers, ...change }));
  }
  return lines;
}

/** Every tab's diff, in the order the tabs are written. */
export const describeExport = (diffs) => diffs.flatMap(describeDiff);

/**
 * The export run: read what each tab holds, show what would change, ask, and write only then.
 *
 * The order is the whole point and is not an implementation detail. Nothing is written before
 * `approve` answers, so a decline - or an `approve` that could not ask anybody, which is what a
 * non-interactive stdin gives - leaves the spreadsheet exactly as it was. That makes the failure
 * mode of every unattended context "nothing happened", which is the only safe direction for a
 * command whose target is a copy a person trusts.
 *
 * `client` is the narrow Sheets seam: `readTab(title)` and `writeTab(title, rows)`. The live one
 * talks to Google, the suite's one does not, and neither knows anything about Recipes.
 */
export async function runExport({ client, tabs, approve, log = () => {} }) {
  const diffs = [];
  for (const tab of tabs) {
    const current = await client.readTab(tab.title);
    diffs.push(diffTab({ title: tab.title, current, desired: tab.rows }));
  }

  for (const line of describeExport(diffs)) log(line);

  const changed = diffs.filter(hasChanges);
  if (changed.length === 0) {
    log('the spreadsheet already says what the database says; nothing to write');
    return { diffs, changes: false, approved: false, written: [] };
  }

  if (!(await approve(diffs))) {
    log('not approved: the spreadsheet was not touched');
    return { diffs, changes: true, approved: false, written: [] };
  }

  const written = [];
  for (const diff of changed) {
    await client.writeTab(diff.title, tabs.find((tab) => tab.title === diff.title).rows);
    written.push(diff.title);
  }
  return { diffs, changes: true, approved: true, written };
}
