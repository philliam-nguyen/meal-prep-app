-- Aisle becomes a table.
--
-- It was free text on the Ingredient, which made "Produce", "produce" and "Veg" three sections of
-- one store, and said nothing about the order the store is walked in. A row per section fixes the
-- first, and a position fixes the second.
--
-- The free-text `ingredients.aisle` column is deliberately untouched here. Nothing yet references
-- these rows, so the Seed loader, the spreadsheet export and the Shopping List keep reading and
-- writing exactly what they read and wrote before; filing Ingredients by reference is its own
-- migration.
--
-- Ids take the shape ADR-0006 fixed, minted by a sequence of this table's own through the
-- readable_id() function 0003 introduced, so the schema has one convention rather than three.

create sequence aisle_id_seq;

create table aisles (
  id text primary key default readable_id('A', nextval('aisle_id_seq')),
  name text not null,
  -- Dense, one-based, and maintained entirely by the API: a client sends the order it wants as a
  -- list of ids and never a number. Nothing reads meaning out of the value beyond how it sorts.
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aisles_id_length check (length(id) <= 32),
  -- Deferred, because a reorder rewrites every position in one statement and rows pass through
  -- each other's values on the way. Checked at commit, so the transaction still cannot leave two
  -- sections claiming one place in the walk.
  constraint aisles_position_key unique (position) deferrable initially deferred
);

-- One row per section of the store, whatever case or surrounding whitespace a caller sends, for the
-- reason ingredients_canonical_name_key exists: the picker this feeds must never offer a name
-- twice, and a rule enforced only in the write path is a rule the next endpoint can miss.
create unique index aisles_canonical_name_key on aisles (lower(btrim(name)));

-- Dropped with the table rather than left behind, and reset by the restore's
-- "truncate ... restart identity", the same way the other two sequences are.
alter sequence aisle_id_seq owned by aisles.id;

create trigger aisles_set_updated_at
  before update on aisles
  for each row
  when (old.* is distinct from new.*)
  execute function set_updated_at();
