# 13 - Homelab Variant: one Compose command and Tailscale

Status: ready-for-human

**What to build:** The Operator brings up the whole Homelab Variant with one Compose command, so
rebuilding after a host change is uneventful. API and Postgres, a named volume, and no host path
assumptions, so the file lifts into a virtual machine later unchanged.

A cook reaches it from the grocery store over Tailscale, with TLS terminated on a real certificate on
the `ts.net` name. There is no login. Tailnet membership is the entire authorization model, and that
is only safe because of where the service sits (ADR-0003). Any change giving this Variant public
ingress invalidates that ADR rather than amending it.

A Proxmox rebuild was considered and rejected: it replaces the host operating system, takes down an
unrelated service already running there, and does nothing for two containers.

Applying the Compose file to the real host is the Operator's step. This ticket delivers the file, the
image wiring and the runbook.

**Blocked by:** 09 (feature parity with what the spreadsheet did), 11 (guardrails, which the Homelab
Variant inherits unconditionally).

- [x] One Compose command brings up API and Postgres from the published image
- [x] Data survives recreating the containers
- [x] No bind mount to a host path appears in the Compose file
- [ ] The app answers on the tailnet name with a valid certificate, and both phones reach it
- [ ] The app does not answer from outside the tailnet
- [x] Migrations apply on start or through a documented one-line command
- [x] A runbook covers bring-up, migration, and where the connection string lives, which is never the repository

## Comments

**The Compose file stopped being able to build, which is the whole of the image wiring.** Both
services now run `${MEAL_PREP_IMAGE:?...}` and `compose.yaml` has no `build:` at all. Leaving the
build in would have meant that a homelab missing the published tag builds from whatever source is
checked out beside the file and runs it under a name claiming otherwise, which is precisely the
drift ADR-0002 exists to stop. The build moved to `compose.build.yaml`, tagging what it produces
with the same `MEAL_PREP_IMAGE`, so building and pulling are one artifact under one name rather
than two. There is no `:-` fallback either: the example file is the only place a default lives, and
running an unintended image is not a thing to do quietly. Unset, Compose refuses with `required
variable MEAL_PREP_IMAGE is missing a value: set MEAL_PREP_IMAGE in .env to the image tag you mean
to run`.

**The port was open to the whole local network and nothing said so.** `'${API_PORT:-8080}:8080'`
publishes on every address the host has, so an app with no login (ADR-0003) was answering any
device on the LAN. It publishes to `127.0.0.1` now, which is where `tailscale serve` proxies from,
and is what makes "reachable only over Tailscale" a property of the deployment rather than a
sentence in a document.

**`TRUST_PROXY` should be `true` on this Variant, which is a reversal of what `.env.example` said.**
`tailscale serve` sets `X-Forwarded-For` to the calling tailnet address, verified in
`addProxyForwardedHeaders` in Tailscale's `ipn/ipnlocal/serve.go` rather than taken from the docs,
which return 403 to a fetcher. It uses `Header.Set`, so a caller's own header is replaced rather
than appended to, and the leftmost value Fastify reads is the one Tailscale wrote. Left `false`,
both phones share a single rate-limit bucket keyed on `127.0.0.1`.

**The migration gate is narrower than the runbook first claimed, and the spec review caught it.**
The first draft said every `docker compose up -d` applies migrations before the API starts.
Reproduced with a throwaway stack of the same shape: on a re-up where nothing changed, Compose
reruns the migration step and leaves the running API alone, so a failing migration exits 1 with the
API still serving. When the API container is replaced, which is what an image change does, the gate
holds and the container sits in `created` with a zero `StartedAt`. The runbook says both, because
the difference is what an Operator hits at the stove.

**Verified by running.** 269 tests green: 229 API against real Postgres, 23 shared, 10 web, 7 new
against `docker compose config`. Data survives recreation for real, not by inspection: a row
written, `docker compose down`, `up` again, row read back. `docker compose run --rm migrate` starts
Postgres, waits for it to be healthy and runs the container's command. The three tests asserting
invariants that already held were watched failing against a deliberately broken file first.

**Not verified here, and it needs the Operator.** The image does not build on this machine, because
the network inspects TLS and `npm ci` inside the container fails on it, so nothing ran the API
container end to end. Boxes four and five are on the host: the certificate on the `ts.net` name,
both phones, and the two negative checks. The runbook lists them as four numbered checks and this
ticket stays `ready-for-human` until they are run.

**ADR-0005 amended.** A suite that sends no HTTP request and touches no database is a third
departure from that seam, further out than either existing exception, so it is recorded there the
way ticket 10 recorded `packages/web`.

**2026-08-17: this host gains a second stack, and the runbook needs a section for it.** The Demo
Variant's API and Postgres now run on the same machine, in their own Compose project
([ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md)). Nothing this ticket built
changes: the Homelab Variant's API stays bound to `127.0.0.1`, `tailscale serve` still reaches it,
`TRUST_PROXY` stays `true` here for the `Header.Set` reason recorded above, and the Compose file is
untouched.

What the runbook has to gain, because an Operator at the stove needs to know which stack they are
looking at:

- The two stacks are separate Compose projects with separate Postgres containers, separate volumes
  and separate networks, and they must not share a password. Sharing one turns the separation into
  decoration.
- The `DOCKER-USER` egress rules that stop the demo network reaching private address ranges, other
  than its own database. This is the control that addresses lateral movement; the rest is inbound.
- The local model runtime on this host stays bound away from the network, recorded as a control
  rather than left as an accident.
- Which container ticket 14's backup dumps, and which it must not.
- The demo's Seed restore timer, its owner credentials, and that it is a security control rather
  than housekeeping.

The isolation this achieves is real and it is not structural: both stacks share a kernel, a Docker
daemon, a filesystem and a root user.
[ADR-0010](../../../docs/adr/0010-demo-guardrails-on-shared-hardware.md) states what is being
accepted and on what grounds. The runbook should point at it rather than restate it.
