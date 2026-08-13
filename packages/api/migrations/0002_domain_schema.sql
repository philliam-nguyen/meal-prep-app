-- The domain schema: Recipe, Ingredient, Recipe Ingredient.
--
-- Ingredient becomes a row with an identity of its own rather than a free-text string compared by
-- lowercasing and trimming. That is what lets Aisle and Pantry state stop fragmenting across two
-- spellings of one food, and what lets matching be a set operation later.
--
-- Ids are readable text minted by a sequence, carrying the spreadsheet's R001 convention forward
-- (ADR-0006). Field length caps, the Recipe Type allowlist and the https-only rule on Recipe Card
-- URLs belong to the shared validation module the write path imports, not to this file: one
-- allowlist in JavaScript that the API and the form both import, rather than a second copy in SQL
-- that can drift away from it.

create sequence recipe_id_seq;
create sequence ingredient_id_seq;

create table recipes (
  id text primary key default 'R' || lpad(nextval('recipe_id_seq')::text, 3, '0'),
  name text not null,
  type text not null,
  card_url text,
  -- The Selected Recipe flag. Named for what it is rather than for the list it feeds, because the
  -- Shopping List is derived and never stored.
  selected boolean not null default false,
  -- Only ever set in the Demo Variant. The Homelab Variant leaves it false, so it is inert there
  -- rather than conditional (ADR-0002).
  protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_id_length check (length(id) <= 32)
);

create table ingredients (
  id text primary key default 'I' || lpad(nextval('ingredient_id_seq')::text, 3, '0'),
  name text not null,
  staple boolean not null default false,
  aisle text,
  got_it boolean not null default false,
  in_pantry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredients_id_length check (length(id) <= 32)
);

-- One Ingredient per food, whatever case or surrounding whitespace a caller sends. Enforced here
-- rather than only in the write path, so no future endpoint can create the duplicate this schema
-- exists to prevent.
create unique index ingredients_canonical_name_key on ingredients (lower(btrim(name)));

create table recipe_ingredients (
  recipe_id text not null references recipes (id) on delete cascade,
  ingredient_id text not null references ingredients (id) on delete restrict,
  -- Null means unquantified, "to taste". The Sheets-era client coerced with parseFloat(...) || 0,
  -- so free text like "a pinch" already summed as zero; this makes the distinction explicit.
  quantity numeric(10, 3),
  unit text not null default '',
  primary key (recipe_id, ingredient_id)
);

-- Deleting a Recipe cascades, and the Shopping List is derived, so a deleted Recipe leaves nothing
-- behind to buy. Deleting an Ingredient a Recipe still calls for is refused instead.
create index recipe_ingredients_ingredient_id_idx on recipe_ingredients (ingredient_id);

-- Tie each sequence to the column that defaults from it, so it is dropped with the table rather
-- than left behind, and so "truncate ... restart identity" resets it along with the rows.
alter sequence recipe_id_seq owned by recipes.id;
alter sequence ingredient_id_seq owned by ingredients.id;

-- A timestamp no write path can forget to set. Maintaining updated_at in the application would put
-- the burden on every endpoint that ever touches a row, and one that forgets leaves a column that
-- lies. The distinctness guard keeps an update that changes nothing from moving the timestamp.
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger recipes_set_updated_at
  before update on recipes
  for each row
  when (old.* is distinct from new.*)
  execute function set_updated_at();

create trigger ingredients_set_updated_at
  before update on ingredients
  for each row
  when (old.* is distinct from new.*)
  execute function set_updated_at();
