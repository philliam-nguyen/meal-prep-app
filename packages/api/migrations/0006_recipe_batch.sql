-- The Batch: how many times a Selected Recipe is being made.
--
-- A column on recipes rather than a table of its own, because a Recipe is selected once at a time:
-- there is no second row for it to be the key of. It is meaningful only while `selected` is true,
-- and the write that clears that flag resets this in the same statement, so the column never
-- carries a number left over from last month's shop.
--
-- Not null with a default of 1 so that every Recipe already here, and every Recipe written by a
-- caller that has never heard of Batch, means what it has always meant: made once.
--
-- The 1 to 9 range is in SQL as well as in the route's schema, which is a deliberate second copy
-- and the only one in this schema. Every other cap lives in the shared validation module alone
-- (0002), because a cap is a rule about what a cook may type and a form has to know it too. This
-- one is different in what it protects: the Shopping List multiplies by this number in SQL, so a
-- value that reached the column by any other path than the route would silently multiply what a
-- cook is told to buy. The upper bound is not arithmetic safety - numeric(10,3) absorbs far more -
-- it is that a Batch is a whole number of dinners, and nine of anything is already a party.
alter table recipes
  add column batch integer not null default 1
  constraint recipes_batch_range check (batch between 1 and 9);
