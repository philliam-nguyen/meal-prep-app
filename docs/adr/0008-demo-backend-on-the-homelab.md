---
status: accepted
date: 2026-08-17
---

# The Demo Variant serves its bundle from AWS and runs its backend on the homelab

The Demo Variant splits across two places. The frontend bundle sits in S3 behind a CloudFront
distribution at `meal-prep.phillip-nguyen.dev`. The API and its Postgres run on the homelab, in a
Compose project separate from the Homelab Variant's. A `t4g.nano` instance in the VPC joins the
tailnet and reverse-proxies `/api/*` from CloudFront onward to that stack.

The homelab accepts no inbound connection from the internet. Tailscale dials out and the proxy
reaches it over the tailnet, so the property [0003](./0003-no-application-auth.md) depends on is
unchanged: nothing on the home network answers a stranger.

CloudFront remains the single origin. The browser sees one hostname, the bundle and `/api/*` arrive
from it, and the frontend keeps the relative paths [0002](./0002-variant-seam-in-infrastructure.md)
describes. What changes is only which component serves the bundle in this Variant, and the browser
cannot tell.

The whole AWS footprint is $7.36 a month against $28.49 for a Fargate task and RDS, both figures
taken from the AWS Price List Bulk API on 2026-08-17 rather than from the pricing pages, and both
carrying the caveat that a price is only as current as the day it was read. The workings are in
[research 0001](../research/0001-api-runtime-cost.md) and
[0002](../research/0002-cloudfront-ec2-tailscale-ingress.md). The saving is real but
it is not the argument. The
argument is that the interesting thing to demonstrate is the hybrid itself, and that a Reviewer who
can read the ingress path in Terraform learns more from it than from another managed-container demo.

## The isolation the tailnet provides, and the isolation it does not

The Demo Variant runs its own Tailscale node, as a sidecar container inside its own Compose project,
authenticated with a tagged auth key. A tailnet grant permits `tag:proxy` to reach `tag:demo` and
nothing else in the tailnet to reach it at all. The Homelab Variant's API stays bound to
`127.0.0.1`, exactly as it was.

That grant is the primary control, and it is worth being precise about why. Both stacks share a
kernel, a Docker daemon, a filesystem and a root user. Nothing on that host is structurally
prevented from reaching anything else on it; what can be said honestly is that the Demo Variant is
unable to reach personal data *as configured*. The tailnet grant is better than a local firewall rule
only because its control plane is not administered from the host it constrains. It is a real control
and it is not a boundary.

Two Postgres containers with two volumes, not two databases in one cluster: Postgres roles are global
to a cluster, so separation inside one cluster is a `GRANT` statement, which is a promise rather than
a mechanism. Separate Compose projects on separate networks, `DOCKER-USER` rules dropping egress from
the demo network to private address ranges except its own database, and no shared password between
the two stacks. Ollama on that host stays bound away from the network, recorded as a control rather
than left as an accident.

This is accepted rather than solved. See [0010](./0010-demo-guardrails-on-shared-hardware.md).

## Considered options

**A Fargate task and RDS, entirely in AWS.** The original design. Rejected on cost once the figure
was verified at $28.49 a month against a $5 account budget, and because it demonstrates a pattern
that is already common. It remains the option to return to if the demo ever needs to be dependable
rather than illustrative.

**A serverless function.** Rejected before cost even mattered. A handler adapter is application code
that exists for one Variant, which is the shape [0002](./0002-variant-seam-in-infrastructure.md)
rejects, and a Lambda container image starts at the Runtime Interface Client rather than
`server.js`, so the single image forks. Priced honestly with RDS Proxy it was also more expensive
than the container task.

**Cloudflare Tunnel instead of the AWS proxy.** Free, and it works. Rejected because it puts the most
interesting half of the architecture in a YAML file on a home server, where nobody assessing the work
will ever see it; because it splits DNS across two providers; because it stacks two content delivery
networks in series, which [0001](./0001-app-level-demo-guardrails.md) already disliked; and because
the client address arrives at the API through two proxies rather than one, degrading the per-address
write rate limit that is one of the few controls this app has.

**Tailscale Funnel.** Ruled out on a fact rather than a judgement: Funnel serves only names in the
tailnet's own `ts.net` domain, so it cannot present `meal-prep.phillip-nguyen.dev`.

**Port forwarding to a reverse proxy.** This is the change [0003](./0003-no-application-auth.md) says
invalidates it rather than amends it. Not taken.

**Everything on the homelab, including the bundle.** Saves the last $7.36 and deletes every Terraform
artifact the demo exists to show. The repository would then contain a Compose file, which ticket 13
already delivers.

**A static demo with no backend, which is what the developer site's spec 0001 assumed.** Cheapest and
simplest. Rejected because a visitor could not tick Pantry items or add a Recipe, Protected would
have nothing to protect, and the demo would show the app without showing that it runs.

## Consequences

The demo depends on residential power, residential internet, and a host that already runs an
unrelated service. It will be down sometimes, and the Operator will occasionally be asleep when it
happens. [0009](./0009-degraded-mode-from-a-recorded-seed.md) is the answer to that and is a
requirement of this decision rather than a nicety.

**CloudFront's defaults defeat the degraded mode.** Three connection attempts at ten seconds each
means a browser waits up to thirty seconds for a dead origin before it sees a 502, and CloudFront
caches that error for ten seconds. The distribution therefore sets `connection_attempts` and
`connection_timeout` down, and the reverse proxy sets its upstream timeouts to two or three seconds.
Left at their defaults a Reviewer reads the demo as broken rather than degraded, which is the
outcome the fallback exists to prevent.

`TRUST_PROXY` grows from a boolean into a boolean *or* a hop count, and the two Variants set it
differently for a reason that is about their proxies rather than about them.

The Homelab Variant keeps `true`. Ticket 13 established that `tailscale serve` sets
`X-Forwarded-For` with `Header.Set`, replacing whatever a caller sent, so the leftmost value is the
one Tailscale wrote and trusting it is correct.

The Demo Variant sets `2`. Its chain is CloudFront then the reverse proxy, both of which append, so
a caller's forged entry survives at the left of the list and `true` would believe it. Counting two
hops inward from the server discards anything the caller wrote. The proxy must append rather than
replace; if it replaces, the count silently resolves to CloudFront's address and every visitor
shares one rate-limit bucket. A test asserts the address the limiter keys on, because the thing
being tested is the proxy's configuration rather than the arithmetic.

This stays inside [0002](./0002-variant-seam-in-infrastructure.md): one build, one code path, two
values in two `.env` files.

The instance is a single point of failure that is also always on, and it is a host the Operator has
to patch. That is operational overhead accepted alongside the isolation risk.

Whether the CloudFront-to-instance hop is private, and therefore whether a certificate is needed on
the instance at all, is not yet established. See ticket 20.

The tailnet policy is versioned in the repository and synced to Tailscale, not edited in the web
console. Tailscale's default policy permits everything, so the grant above does not exist until that
file does, and a control that important should not live somewhere with no history and no review.

The demo pulls its image from a public GitHub Container Registry repository rather than ECR, so no
long-lived AWS credential sits on the homelab. The image holds no secrets; every password arrives
from `.env` at container start.

`us-east-1` excludes `use1-az3` from VPC origins, the same zone excluded from RDS Proxy. A subnet
placed there fails for a reason that resembles nothing being tested.
