const KNOWN_UNITS = new Set(['oz','g','kg','lb','lbs','cup','cups','tbsp','tsp','ml','l','litre','liter','piece','pieces','clove','cloves','can','cans','bunch','head','slice','slices','pinch','handful','dash','drop','stick','sticks','sprig','sprigs','fillet','fillets']);

function parseIngredientLine(line) {
  const m = line.match(/^(\d+(?:[./]\d+)?)\s+(.+)$/);
  if (m) {
    const words = m[2].split(/\s+/);
    if (words.length > 1 && KNOWN_UNITS.has(words[0].toLowerCase())) {
      return { quantity: m[1], unit: words[0], ingredient: words.slice(1).join(' ') };
    }
    return { quantity: m[1], unit: '', ingredient: m[2] };
  }
  return { quantity: '1', unit: '', ingredient: line };
}

function parseCsvRow(line) {
  const cols = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

export function parseTextFile(text) {
  const lines = text.split('\n').map(l => l.trim());
  let name = '';
  const titleIdx = lines.findIndex(l => /^title:/i.test(l));
  if (titleIdx !== -1) {
    const afterColon = lines[titleIdx].replace(/^title:\s*/i, '').trim();
    if (afterColon && !afterColon.startsWith('(')) {
      name = afterColon;
    } else {
      for (let i = titleIdx + 1; i < lines.length; i++) {
        if (lines[i] && !lines[i].startsWith('(')) { name = lines[i]; break; }
      }
    }
  }
  const ingIdx = lines.findIndex(l => /^ingredients:/i.test(l));
  const instrIdx = lines.findIndex(l => /^instructions:/i.test(l));
  const ingEnd = instrIdx > ingIdx ? instrIdx : lines.length;
  const ingredients = [];
  if (ingIdx !== -1) {
    for (let i = ingIdx + 1; i < ingEnd; i++) {
      if (lines[i].startsWith('-')) ingredients.push(parseIngredientLine(lines[i].slice(1).trim()));
    }
  }
  return { name, ingredients };
}

export function parseCsvFile(text, filename) {
  const name = filename.replace(/\.csv$/i, '');
  const rows = text.split('\n').map(l => l.trim()).filter(l => l).slice(1);
  const ingredients = rows.map(row => {
    const cols = parseCsvRow(row);
    return { ingredient: (cols[0] || '').trim(), quantity: (cols[1] || '').trim() || '1', unit: (cols[2] || '').trim() };
  }).filter(r => r.ingredient);
  return { name, ingredients };
}
