---
status: accepted
date: 2026-08-03
---

# The homelab/demo difference lives in infrastructure, never in application code

This project ships two deployments from one codebase: a homelab instance holding real personal
data, and a public AWS instance seeded with fixtures to demonstrate both the app and its
Terraform. The application has no notion of which one it is. There is no `MODE` variable, no
`isDemo` check, and no build-time variant flag. The app reads configuration values —
`DATABASE_URL`, limits, caps — and behaves the same way everywhere. Everything that differs
lives in the wrapper: a Compose file on one side, Terraform on the other.

The alternative — a runtime mode flag driving a policy object — was rejected because every
future feature would invite another `if (isDemo)`, and the two variants would drift until
"works on the homelab" stopped implying "works in the demo." Separate branches or repos were
rejected for the same reason, more severely.

## Consequences

Validation, sanitization, and rate limiting are unconditional. They are not demo concessions;
they apply to the homelab too, which costs nothing there.

Anything genuinely single-sided has to be expressed as a separate service or a configuration
value rather than a branch. A database admin container is a Compose service the Terraform stack
simply omits. Seeded rows are marked with a `protected` flag that the homelab never sets, so
the column is inert rather than conditional.

The frontend is served from the same origin as the API in both variants, so it calls relative
paths and carries no per-variant configuration at all. This is what forced the homelab instance
off GitHub Pages: an HTTPS page on `github.io` cannot call a plain-HTTP API on a private
address, and mixed content is blocked before CORS is even consulted.

## Amendment, 2026-08-21: the wrappers moved; the seam did not

[0008](./0008-demo-backend-on-the-homelab.md) rearranged the deployments this ADR describes. The
Demo Variant is no longer a public AWS instance: its API and Postgres run on the homelab in a
Compose project of their own, and Terraform now builds only the ingress half — S3, CloudFront, and
the proxy instance. "A Compose file on one side, Terraform on the other" is today two Compose
projects side by side, plus a Terraform ingress path for one of them.

**The decision itself is untouched and held.** The application still has no `MODE` variable, no
`isDemo` check, and no build-time flag; every difference between the Variants still lives in the
wrapper. The rearrangement was possible *because* of this seam — the demo backend moved hosts
without a line of application code changing, which is this ADR working as intended.

The database-admin-container example above described a stack that no longer exists. The live
example of the same rule is the Seed restore: a service `compose.demo.yaml` defines and
`compose.yaml` simply omits, the same image with a different command, never an endpoint.
