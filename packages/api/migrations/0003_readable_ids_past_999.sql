-- Readable ids stop colliding after the thousandth row.
--
-- 0002 minted ids with lpad(nextval(...)::text, 3, '0'). lpad does not only pad: given a string
-- already longer than the width it is passed, it cuts the string down to that width. So the
-- thousandth row asked for '1000' and received '100', which is the id the hundredth row already
-- holds, and the primary key refused it. Every value after that truncated onto a row that existed,
-- so an instance that reached a thousand Ingredients could never mint another one.
--
-- Three digits was always meant as a floor rather than a width. ADR-0006 asked for the
-- spreadsheet's R001 shape and nothing more; it never asked for ids to stop at 999. This keeps that
-- shape below a thousand and lets the number run past it.
--
-- Existing ids are left exactly as they are. This changes what is minted next, not what is stored,
-- so no row moves and nothing referencing a row has to be rewritten.

create function readable_id(prefix text, n bigint) returns text
  language sql
  immutable
  -- Immutable because it is only arithmetic on its arguments. nextval stays outside it, in the
  -- column default, where it is evaluated once per inserted row.
  as $$
    select prefix || case when n <= 999 then lpad(n::text, 3, '0') else n::text end
  $$;

alter table recipes
  alter column id set default readable_id('R', nextval('recipe_id_seq'));

alter table ingredients
  alter column id set default readable_id('I', nextval('ingredient_id_seq'));
