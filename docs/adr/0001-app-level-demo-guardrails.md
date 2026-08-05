---
status: accepted
date: 2026-08-03
---

# Public demo guardrails live in the application, not at the edge

The demo variant exposes a writable Postgres-backed API to anonymous visitors on the public
internet. We defend it entirely at the application layer — parameterized queries only, a
least-privileged database role, a `https:` scheme allowlist on recipe card URLs, length and
allowlist validation on every user-supplied field, a request body size limit, per-IP write
rate limiting, and absolute row caps — plus an AWS Budgets alarm and hard ceilings on task
count and database storage. No web application firewall.

The reasoning is that the row caps, not the edge, are what actually bound the damage. The
realistic threat to a portfolio demo is cost amplification and junk content, and both are
capped by refusing the write in the first place. SQL injection, the threat that prompted this
discussion, is closed by parameterized queries and a non-owner database role rather than by
filtering.

## Considered options

**AWS WAF with managed rule sets and a rate-based rule.** Rejected on recurring cost alone,
not on merit. It would block scripted abuse before it reached the service and is a credible
Terraform artifact in its own right — which matters, because showcasing Terraform is half the
reason the demo exists. A standing monthly charge plus per-request fees is not justifiable for
a demo, but this is worth revisiting if the demo ever carries real traffic, and worth building
in some other context purely to have written it. Confirm current pricing before reopening; the
figures discussed here were not verified.

**Cloudflare's free tier in front of CloudFront.** Free and effective, rejected because it
sits outside the Terraform artifact the demo exists to demonstrate, and stacks two CDNs.

## Consequences

Abuse is invisible until the budget alarm fires or someone looks. There is no request-level
blocking, so a determined actor can burn through the rate limit repeatedly; the row caps mean
they cannot grow the bill past a known ceiling by doing so.

Every guardrail above is unconditional rather than demo-only, so the homelab variant inherits
all of it. That is deliberate — see [0002](./0002-variant-seam-in-infrastructure.md) — and
costs the homelab nothing, since there is no value in storing a `javascript:` URL there either.
