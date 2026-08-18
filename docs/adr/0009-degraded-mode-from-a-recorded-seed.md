---
status: accepted
date: 2026-08-17
---

# When the API is unreachable the app renders a recorded Seed, read-only

The bundle ships a JSON file holding one `GET /api/state` response. When the live call fails, the
frontend renders the app from that file, disables every control that writes, and shows a banner
saying the backend is offline and the data is a fixed sample.

This exists because [0008](./0008-demo-backend-on-the-homelab.md) puts the backend on a home server,
which will be unreachable sometimes. A Reviewer clicking the link during an outage is the case that
matters: a dead link reads worse than no link, and it is the only impression that visitor will form.
A degraded app shows the Recipes, the Pantry, the Shopping List and the Best Matches, which is most
of what there is to see.

Controls are visibly disabled rather than accepting input and discarding it. A write that silently
evaporates is worse than a greyed-out button, because the first thing a technical visitor does after
something looks wrong is refresh.

## The file is recorded, never computed twice

The recorded state is captured at build time by loading the Seed into a real Postgres and reading
`GET /api/state` back out. The existing machinery does all of this already: the test suite starts
Postgres through testcontainers, and [0007](./0007-seed-loads-through-the-api.md) makes the restore
an in-process `inject` against the app rather than something needing a running server.

The alternative was to derive the file from `seedFixture.js` in JavaScript at build time. That is the
option to name explicitly, because it looks like the obvious one and it is the wrong one. Only one of
the six fields in the payload is stored data. The Shopping List is summed per unit across every
Selected Recipe by a query that drops nulls so an unquantified Recipe Ingredient never becomes an
amount, and Best Matches is a ranking rule living in its own module. Reimplementing either in
JavaScript would put two implementations of the same derivation in the codebase, which is precisely
the defect `state.js` records having removed:

> The Shopping List is derived here on every read and stored nowhere. It was computed twice before
> this, once in a spreadsheet formula, once in the browser, which is two implementations that could
> disagree about what to buy.

A recording has no second implementation because it has no implementation. It is a snapshot of the
real answer.

## Considered options

**A static offline page.** Honest and cheap, and the visitor sees none of the app. Rejected for the
same reason a dead link is rejected.

**A service worker caching the last good response.** Helps only visitors who have already been, which
is not the visitor this exists for.

**A hand-written fixture.** Drifts the first time anyone edits the Seed, and the drift only surfaces
during an outage, which is when nobody wants to discover it.

## Consequences

The recorded file is validated in CI against `stateResponse`, the schema already exported from
`state.js`. It sets `additionalProperties: false`, so a field added to the payload without
regenerating the recording fails the build rather than the outage.

Degraded mode must not write to the freshness poll's baseline. The recorded payload carries a
`version`, and if that value became the baseline then recovery would depend on it differing from the
live one. Usually it would. Occasionally it would not, and the client would sit on Seed data after
the API was healthy. Recovery forces one unconditional refetch instead.

Ticket 21 found a second reason for the same field to be handled specially, and settled it by
recording the sentinel string `recorded` in place of the live value. `readVersion` builds a version
from `max(updated_at)`, wall-clock times written as the Seed loads, so two recordings of one fixture
would differ in that field and in nothing else. That is the field the fallback never reads, and it
would have made the recording undecidable: the build could not tell a Seed that had changed from a
clock that had moved, so nothing could check the file for staleness, which is the risk this whole
arrangement exists against. Everything else in the payload is already deterministic, because ids come
from sequences the restore's `restart identity` puts back to one.

The sentinel is also the safer value to ship, and it extends the paragraph above rather than
replacing it. Every live version begins with a count of microseconds, so a recorded version can no
longer coincide with one. The unconditional refetch is still the defence and is still where the
behaviour is asserted; the sentinel makes the collision it defends against impossible rather than
merely unlikely. Nothing reads a version for anything but equality, so shipping a value that is not a
timestamp costs nothing.

The recording is committed. The image build cannot produce it: the capture needs a Postgres and so a
Docker daemon, and the build stage inside the image has neither, so the file has to arrive with the
build context. Determinism is what makes that safe. `npm run build` records before it runs Vite, and
the suite fails when the committed file differs by so much as its formatting from what a recording
made now produces, so a Seed edited without a regeneration is a red test rather than a stale
fallback. A hand-edited recording fails the same way, which is the point of comparing the bytes
rather than the parsed object.

One thing the recording cannot carry is a ranking. Best Matches needs a food in the Pantry, and a
restored database has no Pantry ticks, so the recorded list is empty. That is the same empty list a
Reviewer sees on a healthy API before their first tick, and the tick itself is a write degraded mode
disables. Recording a payload with ticks in it would mean recording a state no restore produces, so
the paragraph above overstates it: a degraded app shows the Recipes, the Pantry checklist, the
Staples and the Shopping List, and shows Best Matches empty.

The behaviour is unconditional, so the Homelab Variant carries the recorded file too and never uses
it: there, the API serves the bundle, so an API that cannot answer cannot serve the page that would
fall back. The file is inert rather than conditional, which is the same shape as the Protected column
in [0002](./0002-variant-seam-in-infrastructure.md).

The Homelab Variant's bundle therefore contains sample Recipes that nobody will see. This is
harmless, and it is the price of the two Variants running one build.

The recording is only as fresh as the last build. A Seed edited without a rebuild leaves the fallback
describing the previous fixture. The schema check catches shape changes and cannot catch content
changes, so the recording is regenerated by the build rather than by anyone remembering to.
