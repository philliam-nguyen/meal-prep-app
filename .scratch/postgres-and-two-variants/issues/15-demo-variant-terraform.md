# 15 - Demo Variant Terraform

Status: ready-for-agent

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
  Record the decision here, and write an ADR if it constrains later work.
- The demo's domain name and DNS.

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
