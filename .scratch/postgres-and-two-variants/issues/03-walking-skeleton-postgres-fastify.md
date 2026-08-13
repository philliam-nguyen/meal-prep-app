# 03 - Walking skeleton: Postgres, Fastify, same-origin serving, test harness

Status: done

**What to build:** One command brings up Postgres and the API on a developer machine, and the API
serves the built frontend bundle from its own origin. The frontend therefore calls relative paths and
carries no per-Variant configuration at all (ADR-0002). A test command runs HTTP requests against a
throwaway Postgres and reports green.

Same-origin serving is not a preference. An HTTPS page cannot call a plain-HTTP API on a private
address, and mixed content is blocked before CORS is consulted. Establish it here so no later ticket
discovers it.

Two database roles: migrations run as an owner role, and the API connects as a restricted role with
no ownership and no DDL rights. Every ticket after this one runs against the restricted role, so
permission problems surface now rather than at deployment (ADR-0001).

The API is Fastify on Node, chosen for built-in schema validation and a maintained rate-limit plugin.
Assume a long-running server process. Whether the Demo Variant runs the API as a container task or a
serverless function stays open and gets settled in ticket 15; a long-running server runs on a
container task unchanged.

**Blocked by:** 02 (workspace layout and frontend build). Done, on branch `postgres-migration`. The
workspace is npm workspaces over `packages/*`; `packages/shared` is the package to import, and it
currently exports only `RECIPE_TYPES`.

**Test tooling is already decided** in `docs/adr/0005-http-tests-against-real-postgres.md`: the suite
runs on `node:test`, requests go through Fastify's `inject`, and Postgres is one throwaway
`@testcontainers/postgresql` container per run with tables truncated between tests. Build the fixture
so it applies migrations as the owner role, creates the restricted role, and hands the app only the
restricted connection string; two of the checklist items below then hold by construction rather than
needing tests written for them. `packages/shared` exports JSON Schema, which Fastify consumes as
route schemas directly.

- [x] One Compose command starts Postgres and the API
- [x] A request to the API's health path returns success
- [x] Requesting the API's root serves the built frontend
- [x] Migrations apply from empty to current, and a second run is a no-op
- [x] The API's database role cannot create, alter or drop a table, proven by a test
- [x] The test command provisions a real Postgres, runs at least one HTTP test, and cleans up
- [x] No connection string, password or spreadsheet identifier is committed

## Comments

Landed on branch `postgres-migration`. `docker compose up --build` brings up Postgres, a migration
step that runs to completion, and the API on `localhost:8080` serving the bundle at `/` and the API
under `/api`. 16 tests, all green.

**The `/api` prefix is load-bearing.** The Demo Variant's CDN routes by path, so the API cannot own
`/` even though the homelab instance serves the bundle from the same process. Health is
`/api/health`.

**Two roles, created by the migration step rather than by hand.** `npm run migrate` applies pending
migrations as the owner and then ensures the restricted role exists with its grants, both idempotent.
One implementation, shared by Compose and the test fixture, so there is no init-script-versus-fixture
drift to discover later. Nothing but that command ever holds owner credentials.

**Migration 0001 has no tables in it.** It takes away what Postgres grants PUBLIC by default: CREATE
on schema `public`, and CREATE and TEMPORARY on the database. Without that last one the restricted
role can still `create temp table`, which is a table. Ticket 04 owns the domain schema and this
deliberately does not pre-empt it.

**The migration runner** stores a checksum per file and refuses to run when a file has changed after
it was applied. Checksums normalize line endings, or a working copy checked out with CRLF disagrees
with the container's LF and every migration looks edited.

**Review caught two real defects,** both fixed: the blanket `grant ... on all tables in schema
public` handed the API role the migration bookkeeping table, so it could have deleted a row and made
an applied migration run again; and the bookkeeping table was created *before* the advisory lock, so
the concurrent-run race the lock exists to prevent was still open. Both now have tests.

**One deliberate exception to the parameterized-queries rule,** recorded in `roles.js`: the role
password is interpolated into `create role`, because Postgres accepts no parameters in DDL. It is
escaped by `pg`, not by hand, and the statement reaches the server log under `log_statement=ddl`.

**The npm CA hook is gone,** removed at the operator's direction because the homelab does not need
it. The Dockerfile ran `npm ci` behind an optional build secret carrying a private root certificate,
for networks that inspect TLS. Consequence: on a machine behind TLS inspection, `docker compose
build` fails with `SELF_SIGNED_CERT_IN_CHAIN` while resolving packages. Nothing else fails there.
`npm test` and `npm run dev` are unaffected, because the Docker daemon pulls `postgres:17-alpine`
and Vite installs on the host. Build images on the homelab, or reintroduce the hook in gitignored
local files.

**Only the api service builds now.** Both services previously carried the same `build` and the same
`image` tag, which built the image twice and, once, collided on export
(`image "docker.io/library/meal-prep-app:local": already exists`). That collision is intermittent: it
never reproduced afterwards, warm or with `--no-cache`. The duplicate build was worth removing
anyway. `migrate` now runs the api service's image with `pull_policy: never`, which holds because
Compose builds before it creates any container. All three paths verified from an absent image:
`docker compose build`, `docker compose up --build`, and `docker compose up`. The last one logs one
`pull access denied` line before it falls back to building, which is Compose resolving an image name
that no registry serves.

**`.gitignore` left alone**, on the operator's call. It ignores `docs/agents/` and `CLAUDE.md`
while the committed `CLAUDE.md` points at `docs/agents/issue-tracker.md`, so a fresh clone gets
neither.

**Typechecking.** Ticket 02 left "adding a typechecker is a real decision that wants making before
ticket 03 writes the shared validation module" open. ADR-0005 already settled it: JSON Schema is the
shared contract, TypeScript was considered and rejected. So there is no typechecker to run, and
verification here is the suite plus `node --check`.

**Not done here.** `packages/shared` still exports only `RECIPE_TYPES` — the health endpoint's
schema is small enough to sit inline, and the shared JSON Schema arrives with the first write
endpoint in ticket 05. No CORS, rate limiting, body size limit or row caps: ticket 11 owns those.
Cache headers on the bundle are untouched.
