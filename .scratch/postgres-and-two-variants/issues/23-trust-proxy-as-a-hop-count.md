# 23 - TRUST_PROXY accepts a hop count, not only a boolean

Status: done

**What to build:** `TRUST_PROXY` grows from a boolean into a boolean or a positive integer, and the
write rate limiter keys on the visitor's address in both Variants. Today it is boolean only, which is
correct for the Homelab Variant and unsafe for the Demo Variant.

**Why the two Variants need different values.** The difference is in their proxies, not in them, so
this stays one build and two `.env` files
([ADR-0002](../../../docs/adr/0002-variant-seam-in-infrastructure.md)).

The Homelab Variant keeps `true`. Ticket 13 established, by reading
`addProxyForwardedHeaders` in Tailscale's `ipn/ipnlocal/serve.go` rather than the docs, that
`tailscale serve` sets `X-Forwarded-For` with `Header.Set`. It replaces whatever a caller sent, so
the leftmost value is the one Tailscale wrote and believing it is right.

The Demo Variant sets `2`. Its chain is CloudFront then the reverse proxy on the instance, and both
append. A caller's forged entry therefore survives at the left of the list, so `true` would believe
it: an attacker sending `X-Forwarded-For: 1.1.1.1` and changing it each request would never be rate
limited at all. Counting two hops inward from the server discards anything the caller wrote and
lands on the address CloudFront recorded.

**Why it matters more than it looks.**
[ADR-0010](../../../docs/adr/0010-demo-guardrails-on-shared-hardware.md) keeps app-layer defence
with no web application firewall, so per-address write rate limiting is one of the few controls
there is. A limiter keying on the wrong value is worse than no limiter, because it reports success.

**The thing the test is actually testing is the proxy's configuration.** If the reverse proxy is
configured to replace `X-Forwarded-For` rather than append to it, the hop count of 2 silently
resolves to CloudFront's address and every visitor on earth shares one bucket. The arithmetic is not
in doubt; the deployment is. Write the test so it fails on that mistake.

**Blocked by:** None.

- [x] `TRUST_PROXY` parses `true`, `false` and a positive integer, and rejects anything else loudly
- [x] `.env.example` documents all three forms and says which Variant uses which, replacing the
      comment that currently says "On for the Demo Variant behind CloudFront"
- [x] A test proves the limiter keys on the visitor's address through a two-proxy appending chain
- [x] A test proves a forged leading `X-Forwarded-For` entry cannot move the bucket
- [x] A test proves the Homelab Variant's replacing-proxy case still works with `true`
- [x] A proxy that replaces rather than appends fails a test rather than degrading quietly
