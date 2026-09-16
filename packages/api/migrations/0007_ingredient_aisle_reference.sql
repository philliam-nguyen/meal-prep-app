-- Ingredients are filed into an Aisle by reference now, and the Aisles the Seed shelves them into
-- are Protected.
--
-- Free text on the Ingredient meant "Produce", "produce" and "Veg" were three sections wearing one
-- name, which is the bug the Aisle table (0004) exists to fix. This is the migration that finally
-- points the Ingredient at it. The text column is dropped rather than migrated: the Homelab Variant
-- has never had an Aisle set (the spec that added the table says so), and the Demo Variant is
-- reseeded on its own schedule, so there is nothing richer than the fixture to carry forward.
--
-- Aisle gains Protected here rather than in 0004, for the reason 0004's own comment gives: nothing
-- seeded an Aisle until the loader that assigns Ingredients by reference existed, and ADR-0007 says
-- a mark nothing sets yet has no migration to arrive in.

alter table ingredients
  drop column aisle;

alter table ingredients
  add column aisle_id text
    constraint ingredients_aisle_id_fkey references aisles (id) on delete set null;

-- Only ever set by the Seed loader, directly, the way Protected is set on recipes: no endpoint may
-- set it (ADR-0007). The Homelab Variant seeds nothing, so every Aisle there defaults to false and
-- the flag is inert (ADR-0002).
alter table aisles
  add column protected boolean not null default false;
