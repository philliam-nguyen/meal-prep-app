# 19 - Readable ids collide past 999

Status: ready-for-agent

**What to build:** An id generator that keeps minting distinct ids after the thousandth row, and a
migration that moves both sequences onto it.

`0002_domain_schema.sql` mints readable ids with `lpad(nextval(...)::text, 3, '0')`. Postgres `lpad`
truncates when the string is already longer than the target length, so every value past 999 is cut
back to three characters and collides with a row that already exists:

```
 n     | 'I' || lpad(n::text,3,'0')
-------+--------------
    99 | I099
   100 | I100
   999 | I999
  1000 | I100     <- collides with n = 100
  1001 | I100     <- and again
 12345 | I123
```

Both tables are affected: `recipes.id` and `ingredients.id` carry the same default.

**How it surfaces.** The thousandth insert fails on `ingredients_pkey` or `recipes_pkey` with SQLSTATE
23505. The recipe write path catches 23505 and reports `This Recipe lists one Ingredient twice.`,
which is the wrong reason and sends a cook looking for a duplicate that is not there. After that the
instance cannot mint another Ingredient at all, because every subsequent value truncates onto a row
that already exists. Nothing recovers on its own.

**How reachable it is.** `RECIPES_MAX` defaults to 500, so the Recipe cap hides the recipes half
until somebody configures a larger instance. The Ingredients half has no such cover: the ceiling
ticket 09 restored is `RECIPES_MAX * RECIPE_INGREDIENTS_MAX`, which is 50000 by default, fifty times
past the point the ids break. A homelab that edits Recipes over a few years reaches a thousand
distinct Ingredients without anything unusual happening, because an edit leaves the foods it stops
naming behind.

**Found by** ticket 09, whose Ingredient-ceiling tests minted a thousand rows and hit this instead of
the cap. Those tests were rewritten to stay under 999 so they test the ceiling rather than this bug.
That workaround is a comment in `edit-delete-recipe.test.js` and should go when this is fixed.

**Not a data-loss bug.** Every collision is refused by the primary key, so no row is overwritten and
no id is handed to two rows. What is lost is the ability to write, and the honesty of the refusal.

Suggested shape, so the padding is a floor rather than a width:

```sql
create function readable_id(prefix text, n bigint) returns text language sql immutable as $$
  select prefix || case when n <= 999 then lpad(n::text, 3, '0') else n::text end
$$;
```

ADR-0006 chose readable text ids minted by a sequence and is not in question here — this keeps the
R001 convention it asked for and only stops it truncating. Worth a line in that ADR recording that
the padding is a minimum width.

**Blocked by:** None. Should land before ticket 17, because the extract decides how many Ingredients
a real instance starts with and cutover is the point where that number stops being hypothetical.

- [ ] `recipes.id` and `ingredients.id` keep minting distinct ids past 999, proven by a test that
      crosses the boundary
- [ ] A migration moves both existing defaults onto the fixed generator
- [ ] Existing ids are left alone; this changes what is minted next, not what is stored
- [ ] The recipe write path's 23505 handler no longer reports a primary key collision as a repeated
      Ingredient
- [ ] Ticket 09's `recipesMax: 1` workaround comment in `edit-delete-recipe.test.js` is removed and
      the ceiling tests can use a realistic cap
- [ ] ADR-0006 records that the padding is a minimum width rather than a fixed one
