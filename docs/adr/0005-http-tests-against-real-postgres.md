---
status: accepted
date: 2026-08-04
---

# Tests are HTTP requests against a real Postgres, driven by node:test and Testcontainers

The spec fixed the seam: every test sends an HTTP request to the API and asserts on the response
and on what later requests report. Nothing is mocked, and the database is real. This ADR fixes the
tooling underneath that, because the repository has no tests and no test tooling at all today, so
whatever ticket 03 builds becomes the convention every ticket after it follows.

The suite runs on `node:test`, Node's built-in runner. Requests go through Fastify's `inject`, which
runs the whole request lifecycle (routing, schema validation, hooks, serialization) without binding
a socket. Postgres comes from `@testcontainers/postgresql` as one throwaway container per run, with
every table truncated between tests. The fixture applies migrations as the owner role, creates the
restricted role the API connects as, and hands the application only the restricted connection
string.

That last detail earns its place. Ticket 03 asks for proof that migrations apply from empty to
current, and for proof that the API's database role cannot create, alter or drop a table. Both fall
out of how the fixture boots rather than depending on two tests somebody remembers to write.

This is an ADR rather than a line in ticket 03 because it binds tickets 03 through 18. Every
derivation the migration moves into SQL, and every guardrail ADR-0001 requires, gets asserted
through this seam and no other.

## Considered options

**Vitest.** Rejected on dependency weight against benefit. It earns its place on JSX transforms,
browser environments and module mocking, and the spec bans mocking outright while excluding the
frontend from testing, so none of those apply. `node:test` needs nothing installed, and Node is
already in this repository for the frontend build.

**Postgres as a CI service block.** Rejected, though the spec sanctions it ("Provision it as a
throwaway container per run, or as a service in the CI job"). It splits provisioning into a local
path and a CI path that can disagree, and a green CI run then proves less than it appears to.

**Postgres as a Compose service.** Rejected on isolation. Compose is already here for the homelab
deployment, so it looks like the frugal choice, but a long-lived database makes cleanup something
each test has to remember, and a crashed run leaves state for the next one to trip over.

**A container per test file.** Rejected on time. Isolation would be absolute and startup costs
seconds per file. Truncation between tests buys the same isolation for roughly ten endpoints.

**A bound socket for every test.** Rejected as cost without coverage. Body size limits, per-IP rate
limiting and CORS headers are all Fastify-level, so `inject` exercises them; binding a port per test
invites collisions instead. One smoke test over a real listener covers the socket layer that
`inject` skips.

**TypeScript, to keep the shared contract honest.** Rejected because JSON Schema already does it.
The spec wants the API and the client forms validating through one module so that server guardrails
and form validation cannot drift apart. Fastify validates with JSON Schema, so `packages/shared`
exporting schema objects gives the API its route schemas and the client the same objects through
ajv. One source of truth, no type system involved. Converting the frontend's 14 modules would buy
editor ergonomics rather than correctness, and it is a separate decision if anyone wants it later.

## Consequences

Running the tests needs a Docker daemon. That already holds for the homelab deployment, and it means
`npm test` fails rather than degrades on a machine without Docker.

`packages/shared` exports JSON Schema rather than hand-written validators. Anything JSON Schema
cannot express has to become a check written once in the API, never a second validator on the
client, or the drift this arrangement prevents comes back.

Tests arrange state through the API rather than by inserting rows, which the spec asks for anyway,
and truncation makes it compulsory: no test can lean on data another test left behind.

One bounded exception, added when the browse endpoint landed ahead of any write endpoint: tests for
a read path that ships before the write path that fills it have no API to arrange through, so they
insert rows through `test/helpers/rows.js` instead. Assertions still read HTTP responses only, so
nothing about the seam changes. The exception closes when the matching write endpoint exists, and
the helper is deleted rather than kept for convenience.

`POST /api/recipes` closed most of it. `test/helpers/rows.js` is gone, and Recipes are arranged by
creating them through the API, so no test can now set up a Recipe the application would have
refused. What survives is narrower and is `test/helpers/flags.js`: the Selected Recipe flag and the
Protected flag are columns on a Recipe the browse payload reports and no endpoint yet sets, waiting
on ticket 06 for the toggle and ticket 12 for the Seed. The helper updates those two columns on a
Recipe the API created rather than inserting anything, and it goes when those tickets land.

A second exception, added by ticket 10 and different in kind: `test/version.test.js` wraps the pool's
`query` method for the life of a test. The version endpoint promises to answer from one cheap query
to a client that asks for it every few seconds, and promises to read that version before the payload
it travels with. Neither promise is visible in a response body, and both are the kind that a later
change breaks silently. One test counts the statements a request runs; one lands a write between two
of them, through the API. The database stays real and the assertions still read HTTP responses. That
file also holds the last raw statement in the suite, a `delete from recipes`, because ticket 09 has
not shipped a delete endpoint to send instead; it goes when 09 lands.

Every test reaches Postgres as the restricted role, so a missing grant surfaces on the first run
that needs it instead of at deployment.

The frontend keeps having no tests. Once the Shopping List and Best Match derivations move into SQL
it is presentational, and nothing here changes that.

Ticket 10 qualified that, and the line it drew is behaviour against presentation.
`packages/web/src/freshness.js` decides when to ask the API for a version, when to stay quiet, and
what counts as a change. It holds no JSX, renders nothing and imports no framework, and three of that
ticket's acceptance criteria live in it and are invisible from the API. So `packages/web` runs
`node --test` now, the same way `packages/shared` already does, with no renderer, no DOM and no new
dependency. Components still have no tests and are still not meant to.

Those tests supply the module a clock, a document visibility flag and a version reader, which is the
first place in this repository where a test hands code a collaborator. What is supplied is the
browser and the network, not the module under test: the poll's own rules run unmodified, and the
alternative was waiting four real seconds per assertion. Anything reachable through HTTP against the
real database still goes through the seam above, and nothing about that changes.

Test duration now depends on Docker image pull and container start. Expect the first run on a clean
machine to be slow and later runs to be quick, and revisit this if the suite grows enough that one
container per run becomes the bottleneck.
