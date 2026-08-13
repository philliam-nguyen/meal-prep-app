# 02 - Workspace layout and a real frontend build

Status: done

**What to build:** The app loads from a bundle built in this repository. A cook opening it on a
phone gets first paint without waiting on roughly three megabytes of React and babel-standalone from
a public CDN and an in-browser compile of the whole app.

Behaviour does not change. This is still the Sheets-backed app, working the way it works today. Split
the inline script out of the single HTML file into modules under a workspace layout that has a home
for code the API and the frontend will both import later. The build produces a directory of static
files.

The CDN dependency is worth removing beyond latency: a VPN-only app that cannot start without
reaching the public internet is incoherent with the rest of the design. Vendoring the libraries
without a bundler fixes half of it and leaves the in-browser compile in place.

**Context for every ticket after this one:** the migration lands on a branch. `main` keeps serving
the Sheets app from GitHub Pages until ticket 17 cuts over. Each slice is demoable by running the
local stack, not by pushing.

**Blocked by:** None - can start immediately.

- [x] A cold load fetches no third-party script from a public CDN
- [x] The static output directory is produced by a documented build command and is not committed
- [x] Every page that worked before works after: browsing, name search, Recipe Type filter, Recipe detail, shopping list, pantry checklist, Add Recipe, Settings
- [x] The workspace has a package the API and the frontend can both import, empty or near-empty at this point
- [x] No behaviour change and no visual change

## Comments

Landed on branch `postgres-migration`. `main` untouched, so Pages keeps serving the Sheets app
until ticket 17.

**Layout.** npm workspaces over `packages/*`. `packages/web` holds the frontend, `packages/shared`
holds the import target for ticket 03's API. Shared is not empty: `RECIPE_TYPES` moved there out of
the Add Recipe form's inline array. An empty package proves nothing about module resolution, so
there is one real export with one real importer. Values are byte-identical to the old array, so the
strings written to the Recipes tab do not change.

**Build.** Vite 6 with `@vitejs/plugin-react`. JSX compiles ahead of time and React comes out of
`node_modules`, so `babel-standalone` is gone. 176 kB of JS, 55 kB gzipped, against roughly three
megabytes of CDN download plus an in-browser compile.

**Fonts.** Vendored, which goes past the checklist item as written. The item says no third-party
*script*, and the Google Fonts stylesheet is a stylesheet, so it passed on the letter. It still made
a render-blocking request to `fonts.googleapis.com` on every cold start, which is the exact
incoherence this ticket's body objects to. DM Serif Display and Nunito now sit in
`packages/web/src/fonts` as seven woff2 files, 173 kB total. Both are OFL-licensed.

Every subset Google served is vendored, in Google's declaration order, each unicode-range copied
verbatim. The first attempt kept only latin and latin-ext, which review caught as a real visual
regression: Google's vietnamese subset covers `U+1EA0-1EF9`, latin-ext stops at `U+1E9F` and picks
back up at `U+1EF2`, so a Recipe named "Phở Bò" lost its glyphs to a system fallback mid-word.
Shipping every subset costs nothing at runtime, because `unicode-range` means the browser downloads
only the subsets a page actually renders.

**The split.** 840 lines of `index.html` became 14 modules. Every function moved across unchanged.
`computeShoppingList` still groups by Ingredient name alone and keeps the first unit it meets, the
`"Nothing Missing"` sentinel still drives the Best Match copy, and writes still go through Apps
Script. Tickets 04 through 08 own those.

**Two edits that are not pure moves,** both flagged rather than buried:

- `manifest.json` had `/meal-prep-app/` hardcoded in `start_url` and both icon paths. Served from
  the API's own origin at `/`, as ticket 03 requires, those resolve to nothing. Now base-relative.
  This does not make the bundle portable across base paths: `vite.config.js` sets no `base`, so
  `dist/index.html` still emits absolute `/assets/...` script and stylesheet paths. Serving under a
  subdirectory needs a `base` setting, which nothing asks for, since both Variants serve from `/`.
- `RecipesPage` took a `toast` prop it never read. Dropped from the signature and the call site.

**Deleted:** `rewriteSheet` in the old `index.html` had no callers and never had any. Splitting the
file would have promoted it from an unused local to an exported module API, so it went instead.
Nothing referenced it, so nothing changed.

**Not done here.** No tests. The spec pins one seam, HTTP against a real Postgres, and puts the
frontend under "explicitly not tested"; that seam arrives with ticket 03. No typechecker either.
Adding one is a real decision that wants making before ticket 03 writes the shared validation
module, since that module is the one thing both the API and the client import.

**Verification.** Build output greps clean of `cdnjs`, `fonts.googleapis.com` and
`fonts.gstatic.com`; what remains is w3.org SVG namespaces, the app's own Google endpoints, and
React's error URL. All bundle assets serve 200 from `vite preview`. Every page checked by hand in a
browser against localhost.

`Status: done` is not a value in `docs/agents/triage-labels.md`. That table has no terminal state
for finished work, only `wontfix` for work nobody will do. Either add `done` to the table or say
which existing value closes an implemented ticket.
