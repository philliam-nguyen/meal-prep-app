import { ComingWithWrites } from './ComingWithWrites.jsx';

// The Shopping List is derived from the Selected Recipes, so it has nothing to show until a cook
// can select one. That derivation lives in SQL once it lands, replacing both the spreadsheet
// formula and the client-side copy that could disagree with it.

export function ShoppingListPage() {
  return <ComingWithWrites>Your Shopping List appears here once a Recipe can be selected.</ComingWithWrites>;
}
