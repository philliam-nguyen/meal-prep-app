/**
 * How much of an Ingredient a Recipe calls for. A null quantity is unquantified, "to taste", and
 * has to read that way: the Sheets-era client coerced it to 0 and rendered a Recipe as needing no
 * pepper at all. A unit with no number in front of it is not a quantity either, so an unquantified
 * Recipe Ingredient reads the same way whether or not a stray unit came along with it.
 */
export function formatAmount({ quantity, unit }) {
  if (quantity === null || quantity === undefined) return 'to taste';
  return unit ? `${quantity} ${unit}` : String(quantity);
}

export function formatSince(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}
