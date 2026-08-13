import { ComingWithWrites } from './ComingWithWrites.jsx';

// Adding a Recipe returns with the write path, validated through a module this form and the API
// both import so the rules cannot drift apart. The previous form posted to an Apps Script web app
// that appends to the spreadsheet, which nothing here reads any more. Its markup, including a CSV
// and text file upload whose fate is still undecided, is in this file's git history.

export function AddRecipePage() {
  return <ComingWithWrites>Adding a Recipe from your phone returns with the write path.</ComingWithWrites>;
}
