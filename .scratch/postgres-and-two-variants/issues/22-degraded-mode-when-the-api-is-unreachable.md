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

- [x] A failed `GET /api/state` renders the app from the recorded Seed rather than an error page
- [x] Every control that writes is visibly disabled, and none accept input that would be discarded
- [x] A banner names the state: backend offline, data is a fixed sample
- [x] Degraded mode never becomes the freshness poll's baseline, and recovery forces one refetch,
      proven by a test
- [x] Recovery from degraded mode back to live needs no page reload
- [x] The Homelab Variant is unaffected, and no code branches on which Variant it is

## Comments

**Where the behaviour lives.** `packages/web/src/degraded.js` owns the choice of what one load puts on
screen: `readRenderableState` returns the live answer whenever the API gives one, and the recording
otherwise. `packages/web/test/degraded.test.js` drives it with both readers injected, the way
freshness.js takes a browser, so the four cases run without a network or a document.

**The freshness baseline is a symbol.** `NO_BASELINE` is what `versionOnScreen` returns while the
recording is on screen, and being a symbol it is equal to no version any API can answer with, which is
what makes the refetch out of degraded mode unconditional rather than a comparison that happens to
hold. The recorded `version` is never assigned to the ref at all. Two tests sit beside "compares
against what the last refetch arrived with": one drives the collision ticket 21's sentinel now makes
impossible (the API answers `recorded`, and recovery still happens, exactly once), and one holds the
poll open across a whole outage so recovery cannot end up needing a reload.

**Degraded mode is only ever entered by the first paint.** A load with a screenful behind it fails the
way it always did, because replacing a cook's own Recipes with a fixed sample of somebody else's is
not an improvement, and because one failed background poll would otherwise grey out an app whose
backend was down for four seconds. The consequence worth naming: a returning visitor whose browser
holds a cache renders that cache rather than the recording, so they get the pre-existing behaviour for
a failed write (optimistic change, rolled back, toast) rather than a disabled control. ADR-0009
already treats the visitor who has been before as not the visitor this exists for, when it rejects a
service worker for the same reason.

**Not proven by an automated test:** that the disabled attributes reach the screen. The web package
runs plain `node --test`, which cannot import JSX, and this repo has no DOM test runner; adding one is
a bigger decision than this ticket. The wiring was checked by hand instead: only `AddRecipePage` and
`EditRecipePage` import a writing call from `api.js` directly, and every other write is an App handler
passed to a control that now carries `disabled={readOnly}`. The Add form is replaced by a line of text
rather than disabled, because a form that takes twenty fields and then cannot save is the evaporating
write with more typing in it. Edit is unreachable while degraded, its only entrance being a disabled
button on a page that cannot be reached while a form is open.

**The two reads stay live.** Refresh, on the header and in Settings, is not a control that writes, and
it is the way back to live for a visitor who does not want to wait out a poll. It now says "Still
offline" rather than "Data refreshed!" when the backend is still down.
