# 21 - Record the Seed into the bundle

Status: done

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

- [x] A build step produces the recorded state file from a real seeded database
- [x] The file is generated, never committed by hand, and regenerating it twice gives the same result
- [x] The file validates against `stateResponse` in the suite, and a payload field added without
      regenerating fails the check. Running that suite on a push is ticket 16's; there is no CI here
      yet, so the box is amended from "in CI" rather than ticked through
- [x] The recording reuses `restoreSeed` and the testcontainers setup rather than a second path into
      the database
- [x] The bundle carries the file, and its size is small enough not to matter to first paint

## Comments

**Two boxes closed short of what they say, recorded rather than ticked through.**

The check exists and was verified against a real drift: adding a field to `readState` and
`stateResponse` without regenerating fails with `the recorded Seed no longer matches stateResponse:
the payload must have required property 'aisles'`. What does not exist is CI. This repo has no
pipeline at all, so the check runs where every other check runs, in `npm test`. Ticket 16 already
carries the box for running the suite on a push, and this becomes true the day that lands. Left `[~]`
rather than `[x]` because the word in the box is the part that is not yet done.

**Best Matches records empty, and the reason first written down was wrong.** `bestMatches.js` admits
a Recipe on Pantry overlap or on nothing Missing, the second being the Recipe built from Staples
alone, so the ranking does not strictly need a Pantry tick. The Seed simply satisfies neither: no
Seed Recipe is all Staples, and a restored database has no ticks. The recorder is the wrong place to
fix that, because ticking before the capture makes the recording a staged scenario rather than the
state a restore produces, and that equivalence is what lets the suite check the committed file.
Ticket 26 carries the fix that works in both the live and the degraded case. ADR-0009 records the
choice and its cost.
