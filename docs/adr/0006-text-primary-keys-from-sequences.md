---
status: accepted
date: 2026-08-13
---

# Primary keys are readable text minted by Postgres sequences, not uuids

Recipes and Ingredients are keyed by short text ids in the `R001` and `I001` shape, defaulted from
a per-table sequence. The Recipes tab of the spreadsheet already uses `R001`, so the migration
carries a convention the operator recognises instead of inventing one. Ingredient never had an id
at all, and it takes the same shape so the schema has one convention rather than two.

This is a personal project. Two people cook from it, the whole dataset fits on a phone screen, and
the homelab instance that holds the real data sits behind Tailscale. A uuid buys uniqueness across
databases that never merge, and nothing in the spec asks for one.

## Considered options

**uuid, defaulted from `gen_random_uuid()`.** Rejected as overkill, and its main argument does not
survive contact with the design. That argument is that a public Demo Variant should not serve
enumerable ids. But [0003](./0003-no-application-auth.md) already made the Demo Variant open by
design, holding nothing but Seed data, and a visitor can list every Recipe in one request. An
unguessable id would hide fake recipes from someone who is welcome to read all of them.

Against that, story 65 has the operator inspect row counts and a sample of Recipes before
repointing the frontend at the new database. Reading `R014 Leek and Potato Soup` against the
spreadsheet row is a check somebody will actually perform. Reading
`9f1c2a0e-4b77-4f31-b2e6-3c8d5a1f0e42` against it is a check somebody will skip, and a skipped
check is the failure mode the whole cutover plan exists to prevent.

**bigint identity.** Rejected on the same reasoning that picked text: it drops the `R001`
convention for no gain the operator can see. It is what Postgres hands you, and if the id scheme
ever needs revisiting this is the option to revisit it toward.

**The Ingredient's canonical name as its own primary key.** Rejected. It collapses the uniqueness
rule and the key into one thing, which reads well until somebody corrects a spelling: the rename
then rewrites the key on every referencing `recipe_ingredients` row. Fragile renames splitting
Aisle and Pantry state across two spellings of one food is the defect this schema exists to fix.

**Client-minted ids, which is what runs today.** Rejected as already broken. `AddRecipePage` strips
the digits off every loaded recipe id, takes the maximum, adds one and pads to three. Two Demo
Variant visitors saving in the same second both compute the same id, and one of the two inserts
fails on the primary key. Postgres mints the id from here on, and the client never sees the
generator.

## Consequences

The ids are enumerable, and anyone can walk `R001` upward. On the Homelab Variant, Tailscale
membership is the authorization model and a member may read everything anyway. On the Demo Variant,
0003 already granted that access to everyone. Any future decision to put non-public data behind
this API has to revisit both this ADR and 0003 together, because neither one holds alone.

The operator's extract inserts explicit ids carried from the spreadsheet and then bumps each
sequence past the highest value it loaded, or later inserts collide with rows the extract already
wrote. The sequences carry no ownership over rows that already exist.

Ids are capped in length but their format is not constrained, so the extract can carry whatever
column A of the Recipes tab actually holds rather than failing on rows that never matched `R###`.
Nothing reads meaning out of the digits.

The three digits are a minimum width and never a maximum. `R001` is what the hundredth row and
everything below it looks like; the thousandth is `R1000` and the scheme carries on from there.
This is worth stating because the first implementation read it the other way: it padded with
`lpad(nextval(...)::text, 3, '0')`, and `lpad` cuts a string that is already longer than the width
it is given. The thousandth row asked for `1000`, received `100`, and collided with the hundredth.
`0003_readable_ids_past_999.sql` replaced that with a `readable_id()` function whose padding only
ever adds characters. Anything that mints one of these ids has to keep that property, including the
extract at cutover.
