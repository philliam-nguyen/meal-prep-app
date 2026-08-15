# 19 - Readable ids collide past 999

Status: done

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

- [x] `recipes.id` and `ingredients.id` keep minting distinct ids past 999, proven by a test that
      crosses the boundary
- [x] A migration moves both existing defaults onto the fixed generator
- [x] Existing ids are left alone; this changes what is minted next, not what is stored
- [x] The recipe write path's 23505 handler no longer reports a primary key collision as a repeated
      Ingredient
- [x] Ticket 09's `recipesMax: 1` workaround comment in `edit-delete-recipe.test.js` is removed and
      the ceiling tests can use a realistic cap
- [x] ADR-0006 records that the padding is a minimum width rather than a fixed one

## Comments

**`readable_id(prefix, n)` rather than a corrected `lpad` expression.** The obvious repair is to
guard the width inline, but the guard has to name `nextval` and a column default that calls
`nextval` twice mints two values and uses one. A function takes the number as an argument, so the
default evaluates `nextval` once and the padding never sees the sequence. It is marked `immutable`
because it is arithmetic on its arguments; the volatile part stays outside it, in the default.

**Nothing rewrites an existing id.** The migration changes what the next insert mints and leaves
every stored row alone, so no `recipe_ingredients` row has to be repointed and the cutover extract's
carried ids keep working. There was no corrupt row to repair: the primary key refused every
collision rather than letting two rows share an id.

**The 23505 handler now matches one constraint rather than the class.** `recipe_ingredients_pkey` is
the only uniqueness violation on the write path that means "this Recipe names one food twice" — two
spellings that JavaScript reads as different foods and Postgres folds into one Ingredient, whose
second Recipe Ingredient row then lands on a pair the first one took. Matching the SQLSTATE alone is
how a primary key collision came to be reported as a repeated Ingredient. Anything else raising a
23505 is now a 500, which is the honest answer to a uniqueness rule nobody predicted.

**Test scale.** `readable-ids.test.js` moves the sequence instead of writing a thousand rows, which
is what the operator's extract does after loading the spreadsheet, and runs as the owner because the
restricted role can mint from a sequence and deliberately cannot move one. Ticket 09's ceiling suite
keeps one slow test that genuinely fills past the thousandth Ingredient, so the boundary is crossed
by real writes somewhere.

**Found by** ticket 09. Its Ingredient-ceiling tests minted a thousand rows and hit this instead of
the cap.
