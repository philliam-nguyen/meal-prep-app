# 21 - Record the Seed into the bundle

Status: ready-for-agent

**What to build:** A build step that captures one real `GET /api/state` response and writes it into
the frontend bundle, plus the check that stops it going stale. This is the data ticket 22 renders
when the API is unreachable.

The capture loads the Seed into a real Postgres and reads the state back out. Everything needed
exists: the suite already starts Postgres through testcontainers in
`packages/api/test/global-setup.js`, and
[ADR-0007](../../../docs/adr/0007-seed-loads-through-the-api.md) makes `restoreSeed` an in-process
`inject` against the app, so no server has to be running. Load the fixture, inject
`GET /api/state`, write the body.

**Do not compute it instead.** Deriving the file from `seedFixture.js` in JavaScript is the obvious
approach and the wrong one. Only one of the six fields in the payload is stored data. The Shopping
List is summed per unit across every Selected Recipe by a query that drops nulls so an unquantified
Recipe Ingredient never becomes an amount, and Best Matches is a ranking rule with its own module.
Reimplementing either puts two implementations of one derivation in the codebase, which is the
defect the header comment in `state.js` records having removed. A recording has no second
implementation because it has no implementation.
[ADR-0009](../../../docs/adr/0009-degraded-mode-from-a-recorded-seed.md) has the reasoning.

**The check.** Validate the generated file against `stateResponse`, already exported from
`state.js`. It sets `additionalProperties: false`, so a field added to the payload without
regenerating the recording fails the build rather than the outage. This is the whole reason the
schema is worth reusing rather than writing a new one.

**Why staleness is the real risk.** The file is dead code until an outage. Local development, the
test suite and every normal page load use the live API, so drift never surfaces until the one moment
the fallback is the only thing between a Reviewer and a blank page. Regenerating it must be
something the build does, not something a person remembers.

**Blocked by:** None. 12 supplied the fixture and the restore, both landed.

- [ ] A build step produces the recorded state file from a real seeded database
- [ ] The file is generated, never committed by hand, and regenerating it twice gives the same result
- [ ] The file validates against `stateResponse` in CI, and a payload field added without
      regenerating fails the build
- [ ] The recording reuses `restoreSeed` and the testcontainers setup rather than a second path into
      the database
- [ ] The bundle carries the file, and its size is small enough not to matter to first paint
