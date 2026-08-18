# 24 - The demo banner, as configured text

Status: ready-for-agent

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

- [ ] An unset configuration value renders no banner at all, and no code asks which Variant it is
- [ ] A set value renders it, and the text comes from configuration rather than from the codebase
- [ ] The value travels in the state payload and is declared in `stateResponse`
- [ ] The recorded Seed from ticket 21 regenerates cleanly with the new field present
- [ ] The banner and ticket 22's offline banner read sensibly when both are visible
