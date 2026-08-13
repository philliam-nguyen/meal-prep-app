# 05 - Add a Recipe through a shared validation module

Status: done

**What to build:** A cook captures a Recipe on the day they cook it, from the phone: name, Recipe
Type, Recipe Card, and a set of Recipe Ingredients with quantities and units. One validation module
defines the rules and both the API and the form import it, so server guardrails and form validation
cannot drift apart.

Naming a food an existing Recipe already uses attaches the new Recipe Ingredient to that Ingredient
rather than creating a second row, so Aisle and Pantry state stay in one place.

What a caller gets refused at the boundary: a Recipe Card that is not `https:`, a field over its
length cap, a Recipe Type outside the known set (dinner, soup, stew, dessert, bread, lunch,
breakfast, snack), a quantity outside the allowed numeric range. Unit stays free text with a length
cap and a permissive allowlist, because Recipes in the wild use inconsistent units and a strict
enumeration would fail the migration on real data.

The stored-XSS vector this closes is live today: the Recipe Card URL is free text, stored without
validation, and rendered into an anchor's `href`, which React's text escaping does not cover.

**Open question to settle in this ticket:** the current Add page also accepts a CSV or text file
upload of ingredient lines. No user story in the spec covers it. Either keep it working through the
same validation module or drop it, and record which in this file.

Ticket 04 deleted `packages/web/src/recipeFiles.js` along with the form that called it, because the
Add page became a placeholder and the parser had no caller left. That was housekeeping, not an
answer: this question is still open, and keeping the upload means restoring the file from git rather
than writing a parser again.

**Blocked by:** 04 (browse Recipes from Postgres).

- [x] A Recipe with its Recipe Ingredients is created from the app and appears in the browse list
- [x] A `javascript:` or `http:` Recipe Card is refused, and the form shows why
- [x] An over-length name, an unknown Recipe Type and an out-of-range quantity are each refused
- [x] An empty quantity stores as unquantified rather than as zero
- [x] Adding a Recipe naming a food an existing Recipe uses does not create a second Ingredient
- [x] The API and the form import the same validation module, with no rule written twice
- [x] Every query in the write path is parameterized, with no string-built SQL
- [x] Tests arrange state through this endpoint, replacing ticket 04's direct row loading
- [x] The CSV and text upload decision is recorded here

## Comments

**The CSV and text upload is kept.** Settled with the operator on 2026-08-13, answering the open
question in this ticket.

The reasoning is not "no story rejected it". It is that uploading a recipe file was part of how a
person used the app before the migration, and an interaction the original design offered is a
requirement whether or not the spec wrote it down. The absence of a story was a gap in the record.
Stories 67 and 68 now cover it in `docs/specs/0001-postgres-and-two-variants.md`, which is the copy
that reaches `main`; this file does not.

The operator's rule for the migration generally: mechanics underneath an interaction may change to
suit the new architecture, the interaction itself may not disappear, and only a security risk
justifies an exception, worked through together rather than decided in a ticket.

**Ticket 04 did not decide this.** It deleted `packages/web/src/recipeFiles.js` because the Add page
became a placeholder and the parser had no caller, and said so: "Neither deletion was a decision
about the feature, only about not leaving unreachable code." The file comes back from `1b57190^`.

**Security review of the upload path, since the rule above turns on it.** No new server-side surface.
Parsed lines land in the same form fields typed lines do and go through the same schema, so the API
cannot tell the two apart and gains no second entry point to guard. Nothing parsed reaches an
`href`: the parser never populated Recipe Card, and the stored-XSS vector this ticket closes is that
field alone. Ingredient counts from a large file hit the array cap and get refused. Formula injection
is an export concern and does not apply to reading a file.

One addition the old code lacked: a byte ceiling checked before `FileReader` runs, so a large file
fails with a message instead of hanging the tab. Self-inflicted and client-side, but free to prevent.

**The parser's contract changes.** It returned `{quantity: '1', unit, ingredient}` with strings and a
fabricated `1` for any line it could not read a number from. Against this ticket's rule that an empty
quantity stores as unquantified, that invented number is worse than a null. It now returns the wire
shape, quantity as a number or `null`, so parsed input validates against the same schema as typed
input rather than needing a conversion step that could disagree with the form's.

The parser also lives in `packages/shared` rather than back in `packages/web`. ADR-0005 leaves the
frontend untested because it is presentational, and a text-to-data parser is not. In `shared` it gets
23 `node:test` cases without a browser toolchain. `packages/shared` gained a `test` script and the
root `npm test` now runs both workspaces.

**Landed.** 81 tests, all green: 58 in the API package and 23 in shared, up from 30. Also verified
outside the suite, because `inject` skips the socket and no browser driver is installed here:
Postgres in a container with the API on the host, serving the built bundle, answering a real POST.
Valid Recipe 201, `javascript:` card 400, unknown Recipe Type 400, one Ingredient named twice 400,
and a second Recipe naming `potato` attaching to the existing `Potato` row.

**What a human still needs to click.** Nobody has used the form in a browser. The upload path in
particular runs `FileReader` and a file picker, which nothing here exercises.

**Three judgement calls worth a second opinion.**

A quantity must be at least `0.001`, not merely above zero. The column is `numeric(10, 3)`, so
`0.0001` rounds to `0.000` on the way in, which stored the exact value the rule refuses. A test
caught it. The wider decision to refuse zero at all is not stated in the spec, which asks only for
"numeric range validation on quantity": zero is refused here because the Sheets-era
`parseFloat(...) || 0` is what made unquantified and zero indistinguishable, and nullable numeric
exists to separate them. It does mean an extract or Seed carrying a literal `0` is refused and has to
become `null`, which is the cleaning ticket 04 already flagged as due at cutover.

`state.js` builds its two queries from one template with a `where` clause passed in. The checklist
says no string-built SQL. The interpolated value is a literal in the source with no user data
anywhere near it, and the alternative is a second copy of a thirty-line query that can drift from the
first. Recorded rather than hidden.

The Add form resets when the cook switches between Manual and Upload. That matches the
pre-migration page, which called `resetUpload()` on both tab buttons, so it is preserved behaviour
rather than a new annoyance. Worth changing if it turns out to irritate.
