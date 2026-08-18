# 22 - Degraded mode when the API is unreachable

Status: ready-for-agent

**What to build:** When `GET /api/state` fails, the app renders from the recorded Seed that ticket 21
puts in the bundle, disables every control that writes, and shows a banner saying the backend is
offline and the data is a fixed sample. The link keeps working.

This exists because [ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md) puts the
backend on a home server with residential power and residential internet. It will be unreachable
sometimes, and the Reviewer who clicks during those hours forms the only impression they will ever
form. A degraded app still shows Recipes, the Pantry, the Shopping List and Best Matches, which is
most of what there is to see.

**Controls are visibly disabled, not silently discarding.** A write that evaporates is worse than a
greyed-out button, because the first thing a technical visitor does when something looks wrong is
refresh, and a refresh that loses their work reads as a broken app rather than an offline one.

**Keep it out of the freshness poll's baseline.** The recorded payload carries a `version`. If that
value becomes the poll's baseline, recovery depends on it differing from the live one. Usually it
will. Occasionally it will not, and the client sits on Seed data after the API is healthy again.
Recovery forces one unconditional refetch instead. The existing test named "compares against what
the last refetch arrived with, not what it asked about" is where this behaviour is documented, so
the new case belongs beside it.

**It is unconditional, and inert on the Homelab Variant.** Same build both Variants, per
[ADR-0002](../../../docs/adr/0002-variant-seam-in-infrastructure.md). On the homelab the API serves
the bundle, so an API that cannot answer cannot serve the page that would fall back; the recorded
file ships there and is never read. That is the same shape as the Protected column: inert rather
than conditional.

**The timeout work is not here.** CloudFront's defaults mean a browser waits up to thirty seconds
for a dead origin before this ever renders, which would make the demo read as broken rather than
degraded. Shortening that is ticket 15's job, on the distribution and the proxy. Worth knowing while
building this, because testing it locally will feel instant and testing it for real will not.

**Blocked by:** 21 (the recorded state file).

- [ ] A failed `GET /api/state` renders the app from the recorded Seed rather than an error page
- [ ] Every control that writes is visibly disabled, and none accept input that would be discarded
- [ ] A banner names the state: backend offline, data is a fixed sample
- [ ] Degraded mode never becomes the freshness poll's baseline, and recovery forces one refetch,
      proven by a test
- [ ] Recovery from degraded mode back to live needs no page reload
- [ ] The Homelab Variant is unaffected, and no code branches on which Variant it is
