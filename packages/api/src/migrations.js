import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Arbitrary but fixed: two migration runs against one database serialize on this rather than
// racing. Compose starts the migration service once, but a homelab restart or a scheduled Seed
// restore can overlap with it. Taken before anything else, including the bookkeeping table, because
// concurrent "create table if not exists" is itself a race.
const ADVISORY_LOCK_KEY = 6_204_197_318;

const BOOKKEEPING_TABLE = `
  create table if not exists schema_migrations (
    filename text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )
`;

// Hash the content, not the bytes: a working copy checked out with CRLF endings must agree with the
// container's LF, or every migration looks edited on one of the two.
const checksumOf = (sql) => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

/**
 * Applies every migration the database has not seen, in filename order, each in its own
 * transaction. Idempotent: a second run applies nothing. Must be given a client connected as the
 * owner role, since the API's role has no DDL rights.
 */
export async function runMigrations({ client, dir, log = () => {} }) {
  await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  try {
    await client.query(BOOKKEEPING_TABLE);
    const { rows } = await client.query('select filename, checksum from schema_migrations');
    const recorded = new Map(rows.map((row) => [row.filename, row.checksum]));

    const filenames = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    const applied = [];

    for (const filename of filenames) {
      const sql = await readFile(join(dir, filename), 'utf8');
      const checksum = checksumOf(sql);

      if (recorded.has(filename)) {
        if (recorded.get(filename) !== checksum) {
          throw new Error(
            `${filename} changed after it was applied. Migrations are append-only: ` +
              'add a new file rather than editing one that has run.',
          );
        }
        continue;
      }

      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (filename, checksum) values ($1, $2)', [
          filename,
          checksum,
        ]);
        await client.query('commit');
      } catch (cause) {
        await client.query('rollback');
        throw new Error(`${filename} failed to apply: ${cause.message}`, { cause });
      }

      applied.push(filename);
      log(`applied ${filename}`);
    }

    return {
      applied,
      alreadyApplied: filenames.filter((filename) => recorded.has(filename)),
    };
  } finally {
    await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  }
}
