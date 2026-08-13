import { ComingWithWrites } from './ComingWithWrites.jsx';

// The Pantry and Best Matches are two unrelated things the spreadsheet gave one name: what you
// have, an input, and what that implies, an output. CONTEXT.md says not to carry the combined name
// forward, so the tab is the Pantry and Best Matches is what it produces.

export function PantryPage() {
  return <ComingWithWrites>Your Pantry and its Best Matches appear here once the match rule moves into the database.</ComingWithWrites>;
}
