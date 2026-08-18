# 15 - Demo Variant Terraform

Status: ready-for-human

**What to build:** The AWS half of the Demo Variant, as Terraform a Reviewer can read to judge the
infrastructure work and not only the app. A Reviewer clicks the link at any hour and gets the app
populated with Seed data; a visitor ticks Pantry items, adds a Recipe and deletes it again, while
Protected seeded content stays intact for whoever arrives next.

The backend is not in AWS. [ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md) puts the
API and its Postgres on the homelab, in a Compose project of their own, reached over Tailscale. This
ticket builds what sits in front of that.

**Where it lives.** `infra/stacks/recipe/` in the developer site repository, not here, per that
repo's ADR-0003 topology. It reads `zone_id`, `domain_name`, `certificate_arn` and
`oidc_provider_arn` from the platform stack through `terraform_remote_state` rather than declaring
copies. The hostname is `meal-prep.phillip-nguyen.dev`.

**What the stack contains:**

- An S3 bucket for the frontend bundle, with origin access control
- A CloudFront distribution: the default behaviour serves the bundle, an `/api/*` behaviour reaches
  the proxy instance. One origin from the browser's point of view, so the frontend keeps relative
  paths
- A `t4g.nano` instance in a public subnet, joined to the tailnet, reverse-proxying to the homelab
- A security group admitting CloudFront and nothing else, with no inbound SSH; the instance is
  managed over Tailscale SSH
- A Route 53 record in the existing zone
- A deploy role for the bundle, trusting the existing OIDC provider, scoped to one repository and
  one branch

**What it does not contain, and why.** No RDS and no Fargate: the backend is elsewhere. No ACM
certificate: the platform stack already issues one covering the apex and `*.phillip-nguyen.dev`, and
it is `ISSUED`. No Budgets alarm: `monthly-total` already exists account-wide, though its $5 limit
wants revisiting against the new figure. No ECR: the image goes to a public GitHub Container Registry
repository so the homelab needs no AWS credential (ticket 16). No NAT Gateway: the instance sits in a
public subnet, because NAT would cost more than the rest of the design combined.

**Cost.** $7.36 a month, verified against the AWS Price List on 2026-08-17 and recorded in
[research 0002](../../../docs/research/0002-cloudfront-ec2-tailscale-ingress.md). The public IPv4
address costs more than the instance. Confirm before applying; the figure is only as current as its
retrieval date.

**Two settings that are not optional.** CloudFront's `connection_attempts` and `connection_timeout`
come down from their defaults, and the reverse proxy's upstream timeouts go to two or three seconds.
At the defaults a dead origin costs a browser up to thirty seconds before a 502, which means the
degraded mode in ticket 22 never gets seen and a Reviewer reads the demo as broken. The defaults
actively defeat the feature.

**Watch the availability zone.** `us-east-1` excludes `use1-az3` from VPC origins.

**Human-only.** This is the infrastructure the Operator is doing this project to learn. Not to be
dispatched to an agent, matching the developer site's curriculum.

**Blocked by:** 20 (whether a VPC origin serves a public-subnet instance, which decides whether a
certificate and an ACME client exist in this stack at all).

- [ ] `terraform apply` from empty produces a reachable demo, and the Terraform reads well as a
      portfolio artifact
- [ ] One origin serves both the bundle and `/api/*`
- [ ] The stack consumes platform outputs rather than declaring its own zone, certificate or OIDC
      provider
- [ ] The instance reaches the homelab over the tailnet, and accepts inbound from CloudFront only
- [ ] No inbound SSH; the instance is managed over Tailscale SSH
- [ ] CloudFront and the proxy carry the shortened timeouts, proven by timing a request with the
      homelab stack stopped
- [ ] Nothing in the demo's configuration can reach the homelab database
- [ ] Pricing verified in the calculator and recorded before apply
- [ ] The $5 account budget is revisited against the real figure

## Comments

**The domain is settled and the zone already exists.** `phillip-nguyen.dev` is registered and hosted
in Route 53. The Terraform writes records into that zone rather than creating it, so the zone is a
data source and not a managed resource, and destroying this stack must not take the zone with it. The
CloudFront certificate has to be issued in `us-east-1` whatever region the rest of the stack lands
in.

**The runtime decision is held, not made.** The Operator is pricing the two options first. Three
things the pricing work should carry with it, none of them cost figures:

ADR-0002 puts the seam between the Variants in infrastructure and keeps it out of application code. A
Fastify handler adapter exists for one Variant only, which is the shape that ADR rejects. This
ticket also asks for the same container image as the Homelab Variant, and a Lambda container image
starts at the Runtime Interface Client rather than `node packages/api/src/server.js`, so the image
either forks or grows a second entrypoint. A container task runs `server.js` untouched, the way
ticket 03 assumed.

A container task needs something in front of it that CloudFront can name. An ALB carries a standing
monthly charge; an API Gateway HTTP API with a VPC Link is cheaper at the traffic a demo sees. Price
the pair, because the fronting cost is most of the gap between the two options.

Lambda against RDS opens a connection per concurrent execution, which is what RDS Proxy exists to
fix, at roughly what Lambda saved. Price Lambda and the Proxy together or the comparison flatters
Lambda.

Whichever option wins, it wants an ADR: it fixes what ticket 16 publishes and what ticket 17 cuts
over into. Once it lands, this ticket becomes `ready-for-human`; the Operator may write the Terraform
rather than hand it to an agent.

**The banner does not exist yet, and it is not Terraform.** Nothing in `packages/` mentions one.
ADR-0002 makes it configured text rather than a mode check, so it is an API config value plus a
frontend that renders the value when it is set, and only then a Terraform variable supplying the
text. Whoever takes this ticket builds both halves, or splits the app half into its own ticket.

**Nothing was applied and no credentials were present.** `aws sts get-caller-identity` returned
`NoCredentials` on the machine that opened this ticket. Terraform 1.15.8 and aws-cli 2.36.17 are
installed there.

**2026-08-17: the design changed and most of the above is superseded.** The container-versus-
serverless question is void: neither runs. Research priced the cheapest AWS shape at $28.49 a month
against a $5 account budget, and the decision was to run the backend on the homelab instead, at
$7.36 for the AWS half. See [ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md), and
[ADR-0010](../../../docs/adr/0010-demo-guardrails-on-shared-hardware.md) for what that does to the
threat model.

Specifically superseded above: the runtime comment in full, including its ALB and VPC Link pricing
advice; the assumption that this ticket creates a certificate, a Budgets alarm or an ECR repository,
all of which either already exist or are no longer used; and the ticket's original claim that the
Demo Variant would be *structurally* unable to reach personal data. That claim is withdrawn. Both
Variants now share a kernel, a Docker daemon and a filesystem, so the honest statement is that the
Demo Variant is unable to reach personal data as configured. ADR-0010 records the containment and
what is being accepted.

The banner comment still stands, and the app half is now ticket 24.
