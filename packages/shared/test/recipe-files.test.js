// The CSV and text upload parser. Lives in shared rather than in the frontend because it is a pure
// text-to-data function rather than presentation, so it gets tests without a browser toolchain.
//
// The contract is the wire shape the API accepts: quantity is a number or null, never a string and
// never a fabricated 1. That is what lets a parsed line and a typed line meet the same schema.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsvFile, parseRecipeFile, parseTextFile } from '../src/recipeFiles.js';

describe('parsing a text recipe file', () => {
  it('reads the name from the Title line', () => {
    const { name } = parseTextFile('Title: Chicken Teriyaki Bowl\n');

    assert.equal(name, 'Chicken Teriyaki Bowl');
  });

  it('takes the next usable line when the Title line carries no name', () => {
    const { name } = parseTextFile('Title:\n(serves four)\nChicken Teriyaki Bowl\n');

    assert.equal(name, 'Chicken Teriyaki Bowl');
  });

  it('does not mistake the next heading for the name', () => {
    const { name } = parseTextFile('Title:\nIngredients:\n- 2 cups rice\n');

    assert.equal(name, '');
  });

  it('reports no name when the file has no Title line', () => {
    const { name } = parseTextFile('Ingredients:\n- 2 cups rice\n');

    assert.equal(name, '');
  });

  it('reads quantity, unit and Ingredient from a dash line', () => {
    const { ingredients } = parseTextFile('Ingredients:\n- 2 cups rice\n');

    assert.deepEqual(ingredients, [{ name: 'rice', quantity: 2, unit: 'cups' }]);
  });

  it('leaves a word that is not a known unit as part of the Ingredient', () => {
    const { ingredients } = parseTextFile('Ingredients:\n- 2 large onions\n');

    assert.deepEqual(ingredients, [{ name: 'large onions', quantity: 2, unit: '' }]);
  });

  it('reads a line naming one food and no unit', () => {
    const { ingredients } = parseTextFile('Ingredients:\n- 3 eggs\n');

    assert.deepEqual(ingredients, [{ name: 'eggs', quantity: 3, unit: '' }]);
  });

  it('reads a line with no number as unquantified rather than as one', () => {
    const { ingredients } = parseTextFile('Ingredients:\n- salt\n');

    assert.deepEqual(ingredients, [{ name: 'salt', quantity: null, unit: '' }]);
  });

  it('reads a decimal quantity', () => {
    const { ingredients } = parseTextFile('Ingredients:\n- 1.5 litre stock\n');

    assert.deepEqual(ingredients, [{ name: 'stock', quantity: 1.5, unit: 'litre' }]);
  });

  it('reads a fraction as a number', () => {
    const { ingredients } = parseTextFile('Ingredients:\n- 1/2 cup milk\n');

    assert.deepEqual(ingredients, [{ name: 'milk', quantity: 0.5, unit: 'cup' }]);
  });

  it('reads a mixed number as a number', () => {
    const { ingredients } = parseTextFile('Ingredients:\n- 1 1/2 cups flour\n');

    assert.deepEqual(ingredients, [{ name: 'flour', quantity: 1.5, unit: 'cups' }]);
  });

  it('stops collecting at the Instructions line', () => {
    const text = 'Ingredients:\n- 2 cups rice\nInstructions:\n- 1 heat the pan\n';

    const { ingredients } = parseTextFile(text);

    assert.deepEqual(ingredients, [{ name: 'rice', quantity: 2, unit: 'cups' }]);
  });

  it('ignores lines between the headings that are not dash lines', () => {
    const text = 'Ingredients:\nfor the sauce\n- 2 tbsp soy sauce\n';

    const { ingredients } = parseTextFile(text);

    assert.deepEqual(ingredients, [{ name: 'soy sauce', quantity: 2, unit: 'tbsp' }]);
  });

  it('reports nothing usable for a file it cannot read', () => {
    assert.deepEqual(parseTextFile('a shopping receipt\n'), { name: '', ingredients: [], steps: [] });
  });

  it('reads the lines after Instructions as Steps with their ordinals stripped', () => {
    const text =
      'Ingredients:\n- 500 g beef shin\nInstructions:\n1. Brown the beef in batches.\n' +
      '2. Add carrots and stock, simmer two hours.\n';

    const { steps } = parseTextFile(text);

    assert.deepEqual(steps, [
      'Brown the beef in batches.',
      'Add carrots and stock, simmer two hours.',
    ]);
  });

  it('strips a `)`, `-` or `*` ordinal from a Step the same way', () => {
    const text = 'Instructions:\n1) Brown the beef.\n- Add the stock.\n* Simmer two hours.\n';

    const { steps } = parseTextFile(text);

    assert.deepEqual(steps, ['Brown the beef.', 'Add the stock.', 'Simmer two hours.']);
  });

  it('reports no Steps for a file with no Instructions section', () => {
    const { steps } = parseTextFile('Ingredients:\n- 2 cups rice\n');

    assert.deepEqual(steps, []);
  });

  it('still stops the Ingredient section at the Instructions heading with Steps present', () => {
    const text = 'Ingredients:\n- 2 cups rice\nInstructions:\n- heat the pan\n';

    const { ingredients, steps } = parseTextFile(text);

    assert.deepEqual(ingredients, [{ name: 'rice', quantity: 2, unit: 'cups' }]);
    assert.deepEqual(steps, ['heat the pan']);
  });
});

describe('parsing a CSV recipe file', () => {
  const header = 'Ingredient,Quantity,Unit\n';

  it('takes the name from the filename', () => {
    const { name } = parseCsvFile(header, 'Leek and Potato Soup.csv');

    assert.equal(name, 'Leek and Potato Soup');
  });

  it('reads a row into an Ingredient', () => {
    const { ingredients } = parseCsvFile(`${header}Flour,500,g\n`, 'Bread.csv');

    assert.deepEqual(ingredients, [{ name: 'Flour', quantity: 500, unit: 'g' }]);
  });

  it('reads a row with no quantity as unquantified rather than as one', () => {
    const { ingredients } = parseCsvFile(`${header}Salt,,\n`, 'Bread.csv');

    assert.deepEqual(ingredients, [{ name: 'Salt', quantity: null, unit: '' }]);
  });

  it('keeps a comma inside a quoted field', () => {
    const { ingredients } = parseCsvFile(`${header}"Flour, plain",500,g\n`, 'Bread.csv');

    assert.deepEqual(ingredients, [{ name: 'Flour, plain', quantity: 500, unit: 'g' }]);
  });

  it('skips a row naming no food', () => {
    const { ingredients } = parseCsvFile(`${header}Flour,500,g\n,,\n`, 'Bread.csv');

    assert.deepEqual(ingredients, [{ name: 'Flour', quantity: 500, unit: 'g' }]);
  });

  it('reads an unreadable quantity as unquantified', () => {
    const { ingredients } = parseCsvFile(`${header}Pepper,a pinch,\n`, 'Bread.csv');

    assert.deepEqual(ingredients, [{ name: 'Pepper', quantity: null, unit: '' }]);
  });

  it('reports no Steps for a CSV with no Instructions block', () => {
    const { steps } = parseCsvFile(`${header}Flour,500,g\n`, 'Bread.csv');

    assert.deepEqual(steps, []);
  });

  it('reads the lines after the Instructions block as Steps taken whole, commas included', () => {
    const text =
      `${header}beef shin,500,g\ncarrots,2,\nInstructions:\nBrown the beef in batches.\n` +
      'Add carrots and stock, simmer two hours.\n';

    const parsed = parseCsvFile(text, 'Beef Stew.csv');

    assert.deepEqual(parsed.ingredients, [
      { name: 'beef shin', quantity: 500, unit: 'g' },
      { name: 'carrots', quantity: 2, unit: '' },
    ]);
    assert.deepEqual(parsed.steps, [
      'Brown the beef in batches.',
      'Add carrots and stock, simmer two hours.',
    ]);
  });

  it('matches the Instructions row case-insensitively and strips ordinals from its Steps', () => {
    const text = `${header}Flour,500,g\ninstructions:\n1. Mix the flour.\n`;

    const { steps } = parseCsvFile(text, 'Bread.csv');

    assert.deepEqual(steps, ['Mix the flour.']);
  });
});

describe('choosing a parser for a file', () => {
  it('parses a .csv file as CSV', () => {
    const parsed = parseRecipeFile('Ingredient,Quantity,Unit\nFlour,500,g\n', 'Bread.CSV');

    assert.equal(parsed.name, 'Bread');
    assert.deepEqual(parsed.ingredients, [{ name: 'Flour', quantity: 500, unit: 'g' }]);
  });

  it('parses anything else as text', () => {
    const parsed = parseRecipeFile('Title: Bread\nIngredients:\n- 500 g flour\n', 'Bread.txt');

    assert.equal(parsed.name, 'Bread');
    assert.deepEqual(parsed.ingredients, [{ name: 'flour', quantity: 500, unit: 'g' }]);
  });

  it('survives the carriage returns a file written on Windows carries', () => {
    const parsed = parseRecipeFile('Title: Bread\r\nIngredients:\r\n- 500 g flour\r\n', 'Bread.txt');

    assert.equal(parsed.name, 'Bread');
    assert.deepEqual(parsed.ingredients, [{ name: 'flour', quantity: 500, unit: 'g' }]);
  });
});
