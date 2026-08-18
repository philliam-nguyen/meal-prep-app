# 24 - The demo banner, as configured text

Status: done

**What to build:** A visitor to the Demo Variant sees a banner telling them this is a demo populated
with fake data. The Homelab Variant shows nothing, because nobody configured any text there.

Split out of ticket 15, whose comments recorded that the banner did not exist, was not Terraform,
and needed both halves built or splitting off. This is the split.

**It is configured text, never a mode check.** Per
[ADR-0002](../../../docs/adr/0002-variant-seam-in-infrastructure.md) the application has no notion of
which Variant it is. So this is an API configuration value that reaches the frontend through the
payload, and a frontend that renders the value when it is set and nothing when it is not. There is no
`isDemo`, and the Homelab Variant's silence comes from an unset variable rather than from a branch.

The Terraform variable supplying the text is ticket 15's, and it is the last of the three pieces
rather than the first.

**This is not the offline banner.** Ticket 22 adds a second, different banner saying the backend is
unreachable and the data is a fixed sample. They can both be visible at once, on the Demo Variant
during an outage, and the result should read sensibly rather than as two stacked warnings arguing
with each other. Whoever builds the second one owns that interaction.

**Where the value travels.** The state payload is serialized through `stateResponse` in `state.js`,
which sets `additionalProperties: false`, so a new field has to be added to the schema deliberately.
That is the intended friction. Ticket 21 records that payload into the bundle, so adding a field here
means the recording regenerates; the CI check will say so if it does not.

**Blocked by:** None. Ticket 15 supplies the value in the Demo Variant, but the app half works with
the variable set by hand.

- [x] An unset configuration value renders no banner at all, and no code asks which Variant it is
- [x] A set value renders it, and the text comes from configuration rather than from the codebase
- [x] The value travels in the state payload and is declared in `stateResponse`
- [x] The recorded Seed from ticket 21 regenerates cleanly with the new field present
- [x] The banner and ticket 22's offline banner read sensibly when both are visible

## Comments

**The value is `SITE_NOTICE`, and the name is the point.** `readServerConfig` reads it through the
existing `setting()` helper, so Compose's rendered-empty-string and a variable nobody set both mean
no banner, normalized to null because the payload needs a value the schema can name. It is not a
guardrail (it bounds nothing) and the name deliberately describes the banner rather than the
Variant: `DEMO_NOTICE` would be a mode flag wearing a string's clothes. `buildApp` takes it as a
`notice` option defaulting to null, and the `/api/state` handler adds it to `readState`'s result -
it never touches the database, because it is a fact the wrapper configured about the deployment
rather than anything the app stores. `stateResponse` declares it required, `string` or `null`, which
is the deliberate schema friction the ticket named. `compose.yaml` and `.env.example` pass it
through blank the way the guardrail variables travel, so the Homelab Variant's silence is an unset
variable exactly as specified.

**The recording carries null by construction, and that settles the two-banner question.** The
recorder builds its app without a notice, so the recorded Seed is deterministic whatever the build
machine configured, and degraded mode - which renders the recording - always arrives with a null
notice. The frontend's notice state follows the payload on screen, so the configured banner and
ticket 22's offline banner can never stack: degraded mode shows the offline banner alone, which
already says the data is a fixed sample of the demo data, and a visitor restored from cache during
an outage sees the opposite pair, their cached notice and no offline banner, because a load with a
screenful behind it never falls back to the recording. Review verified every edge path (refresh
while offline, failed background reloads, cache restore) and confirmed the pair never meet.

**Review found two things worth fixing, both fixed on the branch.** A comment in `recording.js`
overclaimed that the configured notice is absent for exactly as long as the backend is unreachable,
which the cache path falsifies; it now describes both pairs. And "Site Notice" was a vocabulary
term nothing had gathered, so CONTEXT.md's deployment vocabulary now carries it. Left as found,
deliberately: the rationale mirrored between `recording.js` and `site-notice.test.js` (the repo
already mirrors reasoning between code and tests), and a belt-and-braces `?? null` on App.jsx's
live path that the schema makes unreachable.

**Not proven by an automated test: that the banner reaches the screen.** The render condition lives
in App.jsx, and the web package runs plain `node --test` with no DOM runner - the same boundary
ticket 22 recorded. The API half is where the behavior is asserted: six tests in
`site-notice.test.js` cover the payload when configured and when not, the environment reading
including the blank-string case, and the recording carrying no notice whatever the recording
machine configured.
