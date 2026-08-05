import pg from 'pg';

const BOOKKEEPING_TABLE = 'schema_migrations';

/**
 * Creates or updates the restricted role the API connects as, and grants it exactly the data access
 * it needs: no ownership, no DDL, no TRUNCATE, and no reach into migration bookkeeping (ADR-0001).
 * Default privileges cover tables later migrations add, so a new table does not need a new grant.
 *
 * Idempotent, and must be given a client connected as the owner role.
 *
 * The password is interpolated rather than bound, because Postgres does not accept parameters in
 * DDL. This is the one place in the project that builds SQL from a value, the value is escaped by
 * pg rather than by hand, and it is worth knowing that the statement reaches the server log when
 * log_statement is set to ddl or all.
 */
export async function ensureAppRole({ client, role, password, log = () => {} }) {
  const roleIdent = pg.escapeIdentifier(role);
  const attributes = 'login nosuperuser nocreatedb nocreaterole nobypassrls noreplication';
  const secret = pg.escapeLiteral(password);

  const { rowCount } = await client.query('select 1 from pg_roles where rolname = $1', [role]);
  if (rowCount === 0) {
    await client.query(`create role ${roleIdent} with ${attributes} password ${secret}`);
    log(`created role ${role}`);
  } else {
    await client.query(`alter role ${roleIdent} with ${attributes} password ${secret}`);
    log(`updated role ${role}`);
  }

  const {
    rows: [{ current_database: database }],
  } = await client.query('select current_database()');
  const databaseIdent = pg.escapeIdentifier(database);

  // Revoke before granting, so a role that was previously given more than this loses it.
  await client.query(`revoke all on schema public from ${roleIdent}`);
  await client.query(`revoke all on database ${databaseIdent} from ${roleIdent}`);

  await client.query(`grant connect on database ${databaseIdent} to ${roleIdent}`);
  await client.query(`grant usage on schema public to ${roleIdent}`);
  await client.query(
    `grant select, insert, update, delete on all tables in schema public to ${roleIdent}`,
  );
  await client.query(`grant usage, select on all sequences in schema public to ${roleIdent}`);
  await client.query(
    `alter default privileges in schema public
       grant select, insert, update, delete on tables to ${roleIdent}`,
  );
  await client.query(
    `alter default privileges in schema public grant usage, select on sequences to ${roleIdent}`,
  );

  // The blanket grant above would otherwise hand out the migration record, and a role that can
  // delete a row from it can make an applied migration run a second time.
  const { rowCount: bookkeepingExists } = await client.query(
    'select 1 from pg_tables where schemaname = $1 and tablename = $2',
    ['public', BOOKKEEPING_TABLE],
  );
  if (bookkeepingExists) {
    await client.query(
      `revoke all on table ${pg.escapeIdentifier(BOOKKEEPING_TABLE)} from ${roleIdent}`,
    );
  }

  log(`granted data access on ${database} to ${role}`);
}
