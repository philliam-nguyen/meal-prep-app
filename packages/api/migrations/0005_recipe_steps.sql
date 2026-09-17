-- Steps: the ordered instructions for cooking a Recipe.
--
-- The glossary said the app stores no instructions and links out to a Recipe Card instead. That was
-- a description of the spreadsheet rather than a goal: a Recipe captured from a photo has no link at
-- all, and a link to a video is something to scrub through while cooking.
--
-- Rows rather than one text blob on recipes. Separate rows cost little now and give a later per-Step
-- anchor - a photo, a timer - somewhere to attach to. The key is the Recipe and the position, so the
-- order is the table's rather than something a reader sorts out afterwards, and a Recipe cannot hold
-- two Steps claiming the same place in the list.
--
-- Cascade, like recipe_ingredients: a Step is meaningless without its Recipe, so deleting the Recipe
-- takes its Steps with it rather than leaving rows nothing can reach.
--
-- The length cap on the text is not here. It lives in the shared validation module the API and the
-- Add form both compile, which is where 0002 put every other cap, so there is one number rather than
-- one in JavaScript and a second in SQL that can drift away from it.

create table recipe_steps (
  recipe_id text not null references recipes (id) on delete cascade,
  -- Written 1..n by the write path, which replaces the whole set on every save. Positive rather than
  -- unconstrained because "the third Step" is how a cook reads the list, and a negative position
  -- would be a bug that stored quietly.
  position integer not null check (position > 0),
  text text not null,
  primary key (recipe_id, position)
);
