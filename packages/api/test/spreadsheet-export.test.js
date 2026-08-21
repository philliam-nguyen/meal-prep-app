// The approval-gated export back to the spreadsheet (ticket 18). Nothing here talks to Google: the
// export's whole interest is in what it would write and whether it was allowed to, and both of those
// are decided before a request is made.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { recordedSeedFile } from '../src/config.js';
import { describeDiff, diffTab, exportTabs, runExport } from '../src/spreadsheetExport.js';

// The shape `readState` answers with, narrowed to the fields the export renders. Written out here
// rather than read from a database, because every question below is about rows rather than SQL.
const state = ({ recipes = [], shoppingList = [], pantryChecklist = [], staples = [] } = {}) => ({
  version: 'irrelevant',
  recipes,
  shoppingList,
  pantryChecklist,
  staples,
  bestMatches: [],
});

const tab = (tabs, title) => tabs.find((candidate) => candidate.title === title);

describe('the Recipes tab', () => {
  it('gives a Recipe one row, with its Recipe Ingredients in a single cell', () => {
    const tabs = exportTabs(
      state({
        recipes: [
          {
            id: 'R1',
            name: 'Chana Masala',
            type: 'dinner',
            cardUrl: 'https://example.test/chana',
            selected: false,
            protected: false,
            ingredients: [
              { ingredientId: 'I1', name: 'chickpeas', quantity: 2, unit: 'cup' },
              { ingredientId: 'I2', name: 'salt', quantity: null, unit: '' },
            ],
          },
        ],
      }),
    );

    assert.deepEqual(tab(tabs, 'Recipes').rows, [
      ['Recipe', 'Recipe Type', 'Ingredients', 'Recipe Card', 'Selected'],
      ['Chana Masala', 'dinner', '2 cup chickpeas, salt', 'https://example.test/chana', ''],
    ]);
  });
});

describe('the Shopping List tab', () => {
  // The amounts arrive summed per unit, because two cups plus three hundred grams is not a number
  // (state.js). The cell has to say both rather than pick one, which is the defect the Sheets-era
  // client had.
  it('keeps an amount per unit and carries the Got It mark and the Aisle', () => {
    const tabs = exportTabs(
      state({
        shoppingList: [
          {
            ingredientId: 'I1',
            name: 'flour',
            aisle: 'Baking',
            gotIt: true,
            amounts: [
              { quantity: 2, unit: 'cup' },
              { quantity: 300, unit: 'g' },
            ],
          },
          { ingredientId: 'I2', name: 'thyme', aisle: null, gotIt: false, amounts: [] },
        ],
      }),
    );

    assert.deepEqual(tab(tabs, 'Shopping List').rows, [
      ['Ingredient', 'Amount', 'Aisle', 'Got It'],
      ['flour', '2 cup + 300 g', 'Baking', 'Yes'],
      ['thyme', '', '', ''],
    ]);
  });
});

describe('the Pantry tab', () => {
  // Two lists arrive, because a Staple never appears on the Pantry checklist. One tab, because the
  // question a person asks it is "what does the kitchen hold", and the answer includes the Ingredients
  // nobody is asked about any more. The Staple column is what keeps the distinction visible.
  it('lists what is on hand and the Staples that are never asked about, by name', () => {
    const tabs = exportTabs(
      state({
        pantryChecklist: [
          { id: 'I1', name: 'chickpeas', inPantry: true },
          { id: 'I2', name: 'thyme', inPantry: false },
        ],
        staples: [{ id: 'I3', name: 'salt' }],
      }),
    );

    assert.deepEqual(tab(tabs, 'Pantry').rows, [
      ['Ingredient', 'In Pantry', 'Staple'],
      ['chickpeas', 'Yes', ''],
      ['salt', '', 'Yes'],
      ['thyme', '', ''],
    ]);
  });
});

// Keyed on the leftmost cell rather than on the row number, because the rows are ordered by name and
// one new Recipe near the top would otherwise report every row below it as changed. That diff is
// true and useless: the Operator is being asked to approve, and an approval nobody can read is a
// rubber stamp.
describe('the diff against what the spreadsheet holds', () => {
  const HEADER = ['Ingredient', 'Aisle'];

  it('reports a row the spreadsheet does not have as added', () => {
    const diff = diffTab({
      title: 'Pantry',
      current: [HEADER, ['salt', 'Baking']],
      desired: [HEADER, ['salt', 'Baking'], ['thyme', 'Produce']],
    });

    assert.deepEqual(diff.added, [{ key: 'thyme', row: ['thyme', 'Produce'] }]);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.changed, []);
  });

  it('reports a row nothing in the database accounts for as removed', () => {
    const diff = diffTab({
      title: 'Pantry',
      current: [HEADER, ['salt', 'Baking'], ['thyme', 'Produce']],
      desired: [HEADER, ['salt', 'Baking']],
    });

    assert.deepEqual(diff.removed, [{ key: 'thyme', row: ['thyme', 'Produce'] }]);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.changed, []);
  });

  it('reports a row whose cells moved as changed, keeping both sides', () => {
    const diff = diffTab({
      title: 'Pantry',
      current: [HEADER, ['salt', 'Baking']],
      desired: [HEADER, ['salt', 'Store cupboard']],
    });

    assert.deepEqual(diff.changed, [
      { key: 'salt', before: ['salt', 'Baking'], after: ['salt', 'Store cupboard'] },
    ]);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
  });

  // Sheets drops trailing empty cells on the way out, so a row this wrote as three cells comes back
  // as two. Comparing the raw arrays would report every unticked Ingredient as changed on every run,
  // which is a diff that never settles and an Operator who stops reading it.
  it('does not mistake the empty cells Sheets omits for a change', () => {
    const diff = diffTab({
      title: 'Pantry',
      current: [['Ingredient', 'In Pantry'], ['thyme']],
      desired: [['Ingredient', 'In Pantry', ''], ['thyme', '', '']],
    });

    assert.deepEqual(diff.changed, []);
    assert.equal(diff.unchanged, 1);
  });

  // Recipe names are not unique the way Ingredient names are: nothing in the schema stops two
  // Recipes being called the same thing, and the leftmost cell is the key. Both have to survive, or
  // the second is reported as removed on every run and the export never reaches a settled state.
  it('keeps two rows with the same name apart', () => {
    const diff = diffTab({
      title: 'Recipes',
      current: [HEADER, ['soup', 'Tuesday'], ['soup', 'Friday']],
      desired: [HEADER, ['soup', 'Tuesday'], ['soup', 'Friday']],
    });

    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.changed, []);
    assert.equal(diff.unchanged, 2);
  });
});

// A fake standing in for Google, because the export's whole interest is in what it would write and
// whether it was allowed to. The live client behind this same two-method seam is thin glue over two
// HTTP calls, and the Operator is what exercises it.
function fakeSpreadsheet(contents = {}) {
  const writes = [];
  return {
    writes,
    contents,
    readTab: async (title) => contents[title] ?? [],
    writeTab: async (title, rows) => {
      writes.push({ title, rows });
      contents[title] = rows;
    },
  };
}

const PANTRY_HEADER = ['Ingredient', 'In Pantry'];

describe('the approval gate', () => {
  it('leaves the spreadsheet untouched when the Operator declines', async () => {
    const client = fakeSpreadsheet({ Pantry: [PANTRY_HEADER, ['salt', 'Yes']] });

    const result = await runExport({
      client,
      tabs: [{ title: 'Pantry', rows: [PANTRY_HEADER, ['salt', 'Yes'], ['thyme', '']] }],
      approve: async () => false,
    });

    assert.deepEqual(client.writes, []);
    assert.deepEqual(client.contents.Pantry, [PANTRY_HEADER, ['salt', 'Yes']]);
    assert.equal(result.approved, false);
    assert.deepEqual(result.written, []);
  });

  // The two halves of "shows what would change and writes nothing until approved", asserted at the
  // one moment where both are true: inside the approval itself.
  it('has shown the change and written nothing by the time it asks', async () => {
    const client = fakeSpreadsheet({ Pantry: [PANTRY_HEADER, ['salt', 'Yes']] });
    const shown = [];
    let asked;

    await runExport({
      client,
      tabs: [{ title: 'Pantry', rows: [PANTRY_HEADER, ['salt', 'Yes'], ['thyme', '']] }],
      approve: async () => {
        asked = { shown: shown.join(' '), writes: [...client.writes] };
        return false;
      },
      log: (line) => shown.push(line),
    });

    assert.deepEqual(asked.writes, [], 'the export wrote before it asked');
    assert.match(asked.shown, /Pantry/);
    assert.match(asked.shown, /thyme/);
  });

  it('writes the tabs the Operator approved', async () => {
    const client = fakeSpreadsheet({ Pantry: [PANTRY_HEADER, ['salt', 'Yes']] });
    const desired = [PANTRY_HEADER, ['salt', 'Yes'], ['thyme', '']];

    const result = await runExport({
      client,
      tabs: [{ title: 'Pantry', rows: desired }],
      approve: async () => true,
    });

    assert.deepEqual(client.writes, [{ title: 'Pantry', rows: desired }]);
    assert.deepEqual(result.written, ['Pantry']);
    assert.equal(result.approved, true);
  });

  // One approval covers the run, but a tab nothing changed in is still not rewritten. Rewriting it
  // would put the export's own timestamp on a tab whose contents nobody touched, which is the sort
  // of noise that makes a diff on the next run harder to read rather than easier.
  it('rewrites only the tabs that would change', async () => {
    const client = fakeSpreadsheet({
      Pantry: [PANTRY_HEADER, ['salt', 'Yes']],
      Recipes: [['Recipe'], ['soup']],
    });

    const result = await runExport({
      client,
      tabs: [
        { title: 'Pantry', rows: [PANTRY_HEADER, ['salt', 'Yes'], ['thyme', '']] },
        { title: 'Recipes', rows: [['Recipe'], ['soup']] },
      ],
      approve: async () => true,
    });

    assert.deepEqual(result.written, ['Pantry']);
    assert.deepEqual(client.writes.map((write) => write.title), ['Pantry']);
  });

  // Nobody is asked to approve nothing. An export run against a spreadsheet already saying what the
  // database says is a no-op, and a prompt there would train the Operator to answer without reading.
  it('does not ask when the spreadsheet already matches', async () => {
    const client = fakeSpreadsheet({ Pantry: [PANTRY_HEADER, ['salt', 'Yes']] });
    let asked = false;

    const result = await runExport({
      client,
      tabs: [{ title: 'Pantry', rows: [PANTRY_HEADER, ['salt', 'Yes']] }],
      approve: async () => {
        asked = true;
        return true;
      },
    });

    assert.equal(asked, false);
    assert.deepEqual(client.writes, []);
    assert.equal(result.changes, false);
  });

  // A tab the spreadsheet has never had reads as empty rather than as a failure, and is created by
  // the write that follows the approval rather than by the read that precedes it. Creating it during
  // the preview would be a write before an approval, which is the one thing this may not do.
  it('treats a tab the spreadsheet does not have yet as empty', async () => {
    const client = fakeSpreadsheet();
    const desired = [PANTRY_HEADER, ['salt', 'Yes']];

    const result = await runExport({
      client,
      tabs: [{ title: 'Pantry', rows: desired }],
      approve: async () => false,
    });

    assert.equal(result.diffs[0].added.length, 2);
    assert.deepEqual(client.writes, []);
    assert.deepEqual(client.contents, {});
    assert.equal(result.approved, false);
  });
});

describe('the diff the Operator reads', () => {
  // Named by heading rather than by position: "Aisle" is what they are deciding about, and
  // "column 3" is what they would have to count to find out.
  it('names the column that moved and shows both sides of it', () => {
    const lines = describeDiff(
      diffTab({
        title: 'Shopping List',
        current: [['Ingredient', 'Amount', 'Aisle'], ['flour', '2 cup', 'Baking']],
        desired: [['Ingredient', 'Amount', 'Aisle'], ['flour', '2 cup', 'Store cupboard']],
      }),
    );

    assert.deepEqual(lines, [
      'Shopping List: 0 added, 0 removed, 1 changed, 0 unchanged',
      '  ~ flour',
      '      Aisle: "Baking" -> "Store cupboard"',
    ]);
  });

  // A Recipe Card URL is longer than the rest of a row put together, and a diff that wraps is a
  // diff nobody reads to the end of.
  it('shortens a cell too long to read at a glance', () => {
    const url = `https://example.test/${'x'.repeat(200)}`;
    const lines = describeDiff(
      diffTab({
        title: 'Recipes',
        current: [['Recipe', 'Recipe Card']],
        desired: [['Recipe', 'Recipe Card'], ['soup', url]],
      }),
    );

    assert.ok(!lines.some((line) => line.includes(url)), 'the whole URL reached the diff');
    assert.ok(lines.some((line) => line.includes('soup')));
  });
});

// One pass over a payload the API really produced, rather than over the hand-written objects above.
// The recorded Seed is committed and is checked against a live recording by recorded-seed.test.js,
// so it is the one real `GET /api/state` this suite can read without a database of its own.
describe('a real first-paint payload', () => {
  it('renders every tab with a header and a row per thing', async () => {
    const recorded = JSON.parse(await readFile(recordedSeedFile, 'utf8'));

    const tabs = exportTabs(recorded);

    assert.deepEqual(
      tabs.map((exported) => exported.title),
      ['Recipes', 'Shopping List', 'Pantry'],
    );
    assert.equal(tab(tabs, 'Recipes').rows.length, recorded.recipes.length + 1);
    assert.equal(tab(tabs, 'Shopping List').rows.length, recorded.shoppingList.length + 1);
    assert.equal(
      tab(tabs, 'Pantry').rows.length,
      recorded.pantryChecklist.length + recorded.staples.length + 1,
    );

    // Every cell a string, because that is what Sheets hands back and what the diff compares
    // against. A number written here would come back as its own rendering of itself and report a
    // change on every run.
    for (const exported of tabs) {
      for (const row of exported.rows) {
        for (const value of row) assert.equal(typeof value, 'string');
      }
    }
  });
});

// "Nothing in the app or in either deployment depends on the export running" is the acceptance
// criterion that breaks in silence: an import added here would not fail anything, and the first sign
// would be an API refusing to start on a host with no spreadsheet configured. Asserted the way
// test/compose.test.js asserts the properties that keep the Homelab Variant private.
describe('nothing depends on the export', () => {
  const sourceRoot = resolve(import.meta.dirname, '../src');
  const EXPORT_MODULES = ['spreadsheetExport.js', 'sheetsClient.js'];

  it('is reached from its own command and from nowhere else in the API', async () => {
    const files = (await readdir(sourceRoot)).filter((file) => file.endsWith('.js'));

    const importers = [];
    for (const file of files) {
      if (file === 'export.js') continue;
      const source = await readFile(resolve(sourceRoot, file), 'utf8');
      if (EXPORT_MODULES.some((module) => source.includes(`./${module}`))) importers.push(file);
    }

    assert.deepEqual(importers, [], 'a server path now imports the export');
  });

  // No service, so no deployment can run it by accident and none of the three variables it reads
  // has to be set for a stack to come up.
  it('is not a Compose service', async () => {
    const compose = await readFile(resolve(sourceRoot, '../../../compose.yaml'), 'utf8');

    assert.doesNotMatch(compose, /export/);
  });
});
