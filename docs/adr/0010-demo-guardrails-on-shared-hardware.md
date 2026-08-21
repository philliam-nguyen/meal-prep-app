---
status: accepted
date: 2026-08-17
supersedes: 0001
---

# Demo guardrails, now that the threat is a foothold rather than a bill

Supersedes [0001](./0001-app-level-demo-guardrails.md). Every guardrail that ADR named is kept:
parameterized queries only, a least-privileged database role, an `https:` scheme allowlist on Recipe
Card URLs, length and allowlist validation on every user-supplied field, a request body size limit,
per-address write rate limiting, and absolute row caps. There is still no web application firewall.

What changed is the reasoning underneath, and the reasoning is most of what an ADR is for.

## Why 0001 could not simply be inherited

ADR-0001 justified defending at the application layer alone on this basis:

> The realistic threat to a portfolio demo is cost amplification and junk content, and both are
> capped by refusing the write in the first place.

That was true of a Demo Variant running on Fargate and RDS. It is false of one running on the
homelab. There is no meaningful bill left to amplify, and
[0008](./0008-demo-backend-on-the-homelab.md) puts an anonymous, writable, internet-reachable service
on a host inside a home network. The worst case stops being an invoice and becomes a foothold.

Inheriting 0001 unchanged would have left a document justifying the current defences with an argument
that no longer applies to them.

## The decision, and what is being accepted

The Demo Variant runs on hardware the Operator already owns, so that the demo costs $7.37 a month
rather than $28.49. The price of that is a lateral movement risk and ongoing operational overhead,
and both are accepted rather than mitigated away.

The acceptance is defensible on four specific grounds, and it is worth writing them down because
"accepted" without them is indistinguishable from not having thought about it:

The host carries nothing critical. It runs this app and a local model runtime. There is no financial
data, no credentials for anything that matters, and no service anyone depends on.

The blast radius is bounded by what is on that host, and no long-lived AWS credential is on it. The
image comes from a public registry precisely so that pulling it needs no key, so a foothold on the
homelab does not become a foothold in the AWS account.

The demo is an artifact rather than a service. Nobody depends on it. Losing it entirely costs a link
in a portfolio and a rebuild.

The controls in [0008](./0008-demo-backend-on-the-homelab.md) contain what containment is available
without separate hardware: a tailnet grant administered from outside the host, separate Postgres
containers and volumes, separate Compose projects and networks, egress rules from the demo network to
private address ranges, no shared password between the stacks, and the local model runtime bound away
from the network.

What is *not* claimed is that the Demo Variant is structurally unable to reach personal data. It
shares a kernel, a daemon, a filesystem and a root user with the Homelab Variant. It is unable as
configured. Ticket 15 previously asserted the stronger property; that assertion is withdrawn rather
than quietly reinterpreted.

## What replaced the AWS ceilings

ADR-0001 leaned on an AWS Budgets alarm and hard ceilings on task count and database storage. Those
were the only enforcement outside the application, and they are gone. Their replacements:

Container memory and CPU limits on the demo stack, and a cap on the size of its Postgres volume.
These bound resource exhaustion the way the task and storage ceilings did, on hardware where the
consequence is a full disk rather than a bill.

`RECIPES_MAX` at 200 for the Demo Variant, against the 500 default the Homelab Variant keeps. The cap
and the restore interval together decide the worst state a Reviewer can walk into.

The scheduled Seed restore every six hours. This is listed here, among security controls, on purpose:
it truncates and reloads, so it clears whatever a visitor accumulated *and* whatever an attacker
stored. Its schedule is a security parameter and not only a housekeeping one.

Per ADR-0001's rule, still in force: a tighter public instance is a different `.env`, never a
different build.

## Considered options

**Cloudflare's free tier in front of the API.** ADR-0001 rejected this for sitting outside the
Terraform artifact and stacking two content delivery networks. Reconsidered here because a design
routing through Cloudflare Tunnel would have made it free and already present. That design was not
taken ([0008](./0008-demo-backend-on-the-homelab.md)), so Cloudflare is not in the path and the
original rejection stands unchanged.

**AWS WAF.** Still rejected on recurring cost, and now on relevance: it would sit in front of an
origin whose real exposure is the host behind it rather than the requests reaching it.

**Separate hardware for the Demo Variant.** The honest answer to the isolation question and the one
that would make the strong claim true. Not available. Revisit if a spare machine appears; it would
convert the weakest part of this design into its strongest and would cost nothing but the box.

## Consequences

Abuse is invisible until someone looks. There is no budget alarm to fire now, so the monitoring in
ticket 14's neighbourhood is the only thing that will notice anything, and it notices availability
rather than abuse.

An attacker willing to work within the rate limit can still fill the Demo Variant with junk up to
`RECIPES_MAX`. The restore clears it within six hours and there is no faster remedy.

The four grounds above are load-bearing. If any stops being true, particularly the first, this ADR
needs revisiting rather than reinterpreting. Putting anything on that host worth stealing changes the
decision.
