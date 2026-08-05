-- Least-privilege baseline (ADR-0001).
--
-- The API connects as a role with no ownership and no DDL rights, and that is not what Postgres
-- gives out of the box. Every version grants CREATE and TEMPORARY on a database to PUBLIC, and
-- versions before 15 also grant CREATE on schema public, so a role with nothing but CONNECT can
-- still create a schema, a table inside it, or a temporary table. Take all three away here, once,
-- rather than per role.
--
-- No tables yet: this migration exists to make the privilege baseline part of the schema's history
-- rather than a step somebody has to remember.

revoke create on schema public from public;

do $$
begin
  execute format('revoke create, temporary on database %I from public', current_database());
end
$$;
