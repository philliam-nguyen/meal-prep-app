// Reading a Recipe out of a CSV or text file the cook already holds, so capturing one does not mean
// retyping it (stories 67 and 68). Restored from the pre-migration frontend, where it fed the Add
// form directly.
//
// Output is the wire shape the API accepts rather than the form's strings, so a parsed line and a
// typed line meet the same schema and no conversion step sits between them to disagree with. A line
// with no readable number is unquantified: the original returned 1, which invents a measurement the
// file never gave.
//
// Nothing here trusts the file. The result fills the form, the cook corrects it, and the schema
// refuses whatever survives that is still wrong.

const KNOWN_UNITS = new Set([
  'oz', 'g', 'kg', 'lb', 'lbs', 'cup', 'cups', 'tbsp', 'tsp', 'ml', 'l', 'litre', 'liter',
  'piece', 'pieces', 'clove', 'cloves', 'can', 'cans', 'bunch', 'head', 'slice', 'slices',
  'pinch', 'handful', 'dash', 'drop', 'stick', 'sticks', 'sprig', 'sprigs', 'fillet', 'fillets',
]);

const HEADING = /^(ingredients|instructions|title):/i;
const MIXED_NUMBER = /^(\d+)\s+(\d+)\/(\d+)$/;
const FRACTION = /^(\d+)\/(\d+)$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;

// A mixed number has to be tried before a bare one, or "1 1/2 cups" reads as one cup.
const QUANTITY_PREFIX = /^(\d+\s+\d+\/\d+|\d+(?:[./]\d+)?)\s+(.+)$/;

/** A quantity as a number, or null when the text holds no readable measurement. */
function parseQuantity(raw) {
  const text = raw.trim();

  const mixed = text.match(MIXED_NUMBER);
  if (mixed) {
    const [, whole, numerator, denominator] = mixed;
    return Number(denominator) === 0 ? null : Number(whole) + Number(numerator) / Number(denominator);
  }

  const fraction = text.match(FRACTION);
  if (fraction) {
    const [, numerator, denominator] = fraction;
    return Number(denominator) === 0 ? null : Number(numerator) / Number(denominator);
  }

  return DECIMAL.test(text) ? Number(text) : null;
}

function parseIngredientLine(line) {
  const match = line.match(QUANTITY_PREFIX);
  if (!match) return { name: line, quantity: null, unit: '' };

  const [, rawQuantity, rest] = match;
  const words = rest.split(/\s+/);
  const leadsWithUnit = words.length > 1 && KNOWN_UNITS.has(words[0].toLowerCase());

  return {
    name: leadsWithUnit ? words.slice(1).join(' ') : rest,
    quantity: parseQuantity(rawQuantity),
    unit: leadsWithUnit ? words[0] : '',
  };
}

function readName(lines) {
  const titleIndex = lines.findIndex((line) => /^title:/i.test(line));
  if (titleIndex === -1) return '';

  // "Title: Beef stew" carries the name; a bare "Title:" or a "(serves four)" note does not, so the
  // name is the next line that is not a note. The search stops at the following heading rather than
  // running into the ingredient lines beneath it.
  const sameLine = lines[titleIndex].replace(/^title:\s*/i, '').trim();
  if (sameLine && !sameLine.startsWith('(')) return sameLine;

  const following = lines.slice(titleIndex + 1);
  const nextHeading = following.findIndex((line) => HEADING.test(line));
  const beforeNextHeading = nextHeading === -1 ? following : following.slice(0, nextHeading);

  return beforeNextHeading.find((line) => line && !line.startsWith('(')) ?? '';
}

function readIngredients(lines) {
  const start = lines.findIndex((line) => /^ingredients:/i.test(line));
  if (start === -1) return [];

  const instructions = lines.findIndex((line) => /^instructions:/i.test(line));
  const end = instructions > start ? instructions : lines.length;

  return lines
    .slice(start + 1, end)
    .filter((line) => line.startsWith('-'))
    .map((line) => parseIngredientLine(line.slice(1).trim()))
    .filter((ingredient) => ingredient.name);
}

/** Splits one CSV row, keeping a comma that sits inside a quoted field. */
function splitCsvRow(row) {
  const columns = [];
  let current = '';
  let quoted = false;

  for (const character of row) {
    if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      columns.push(current);
      current = '';
    } else current += character;
  }

  columns.push(current);
  return columns;
}

const toLines = (text) => text.split('\n').map((line) => line.trim());

/** Reads a `Title:` / `Ingredients:` / `Instructions:` text file. */
export function parseTextFile(text) {
  const lines = toLines(text);
  return { name: readName(lines), ingredients: readIngredients(lines) };
}

/** Reads an Ingredient, Quantity, Unit CSV. The Recipe takes its name from the filename. */
export function parseCsvFile(text, filename) {
  const ingredients = toLines(text)
    .filter(Boolean)
    .slice(1)
    .map((row) => splitCsvRow(row))
    .map((columns) => ({
      name: (columns[0] ?? '').trim(),
      quantity: parseQuantity(columns[1] ?? ''),
      unit: (columns[2] ?? '').trim(),
    }))
    .filter((ingredient) => ingredient.name);

  return { name: filename.replace(/\.csv$/i, ''), ingredients };
}

/** Reads whichever of the two formats the filename indicates. */
export function parseRecipeFile(text, filename) {
  return /\.csv$/i.test(filename) ? parseCsvFile(text, filename) : parseTextFile(text);
}
