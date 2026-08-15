# 15 - Demo Variant Terraform

Status: needs-info

**What to build:** A Reviewer clicks the demo link at any hour and gets a working app populated with
Seed data, plus Terraform they can read to judge the infrastructure work and not only the app. A
visitor ticks Pantry items, adds a Recipe, deletes it again, and gets the full app rather than a
read-only tour, while Protected seeded content stays intact for whoever arrives next.

Always-on rather than applied on demand, because a reviewer clicks the link without warning and a
dead link reads worse than no link.

CloudFront is the single origin and routes by path: the bundle from object storage, `/api/*` to the
API service. A small single-AZ RDS Postgres holds the data and is the entire recurring cost. A
scheduled task restores the Seed, so accumulated visitor content clears itself. A banner tells the
visitor they are looking at a demo with fake data, as configured text rather than a mode check
(ADR-0002).

Cost controls per ADR-0001: an AWS Budgets alarm, a hard ceiling on task count, and a hard ceiling on
database storage. Abuse is otherwise invisible until someone looks.

The Demo Variant must be structurally unable to reach personal data. Isolation is a property of the
deployment, not a promise in a document.

**Open in this ticket:**

- Whether the API runs as a container task or a serverless function. Ticket 03 assumed a long-running
  server, which runs on a container task unchanged; a serverless function needs a handler adapter.
  Record the decision here, and write an ADR if it constrains later work. **Held** while the Operator
  prices both; see the comments below for the constraints that decision carries.
- ~~The demo's domain name and DNS.~~ Settled: `phillip-nguyen.dev`, in Route 53 already.

**Verify before applying:** every cost figure discussed during design was an estimate and none were
checked. Confirm current pricing in the AWS pricing calculator and record what you find before
`terraform apply`.

**Blocked by:** 11 (guardrails and the configured CORS origin), 12 (the Seed and its restore command).

- [ ] `terraform apply` from empty produces a reachable demo, and the Terraform reads well as a portfolio artifact
- [ ] One origin serves both the bundle and `/api/*`
- [ ] The demo runs the same container image as the Homelab Variant
- [ ] A scheduled task restores the Seed, and visitor content clears with no Operator involvement
- [ ] A visitor sees a banner naming it a demo with fake data
- [ ] A Budgets alarm reaches the Operator, and task count and database storage carry hard ceilings
- [ ] Nothing in the demo's configuration can reach the homelab database
- [ ] The container-versus-serverless decision is recorded here
- [ ] Pricing verified in the calculator and recorded before apply

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
