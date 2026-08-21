# 27 - Demo Variant: the second Compose stack on the homelab

Status: ready-for-human

**What to build:** The Demo Variant's API and Postgres, running on the homelab in a Compose project
of their own, reachable from the AWS proxy over the tailnet and from nothing else.
[ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md) decided this stack exists. Nothing
has built it.

**Why this ticket exists at all.** Three tickets describe this stack and every one of them hands it
to someone else. Ticket 15 says "the backend is not in AWS ... this ticket builds what sits in front
of that". Ticket 13 says the requirement "is not this ticket's to deliver" and points at ticket 25.
Ticket 25 lists it under **Blocked by: 15 (the Demo Variant's stack really running on this host)**,
which is the ticket that already declined it. The artifact everything downstream waits on was never
assigned. Confirmed on the host on 2026-08-20: `docker compose ls` shows one project, `meal-prep`,
and `docker volume ls` shows one volume. There is no demo stack, no demo Postgres and no Tailscale
sidecar.

**Everything here is transcription, not design.** ADR-0008 and
[ADR-0010](../../../docs/adr/0010-demo-guardrails-on-shared-hardware.md) already decided the shape,
the controls and what is being accepted. This ticket is those decisions turned into files and host
state. Where it departs from them, say so in a comment rather than quietly.

**The stack.** A second Compose file in this repository, project name `meal-prep-demo`, with its own
Postgres container, its own named volume, its own network and its own `.env`. Not a second database
in the Homelab Variant's cluster: Postgres roles are global to a cluster, so separation inside one is
a `GRANT` statement, which ADR-0008 calls a promise rather than a mechanism. Same four services the
Homelab Variant has, `db`, `migrate`, `api`, plus a Tailscale sidecar, all from the one published
image per ADR-0002. Nothing in it builds, for the reason ticket 13 recorded.

**The API publishes no host port at all.** This is the one place the demo stack is *tighter* than the
Homelab Variant rather than looser. The Homelab Variant binds `127.0.0.1:8080` because
`tailscale serve` runs on the host and proxies from there. The demo's Tailscale node is a container
inside the project, so it reaches the API across the Compose network and the API needs no host
binding whatsoever. A published port here would put an anonymous writable service on the host's
loopback beside the real one, which is the arrangement ticket 13 went out of its way to close.

**The sidecar is tagged `tag:demo`, and the grant is the primary control.** The auth key is tagged at
first authentication, the same idiom ticket 15 used for `tag:proxy`. The tailnet grant permits
`tag:proxy` to reach `tag:demo` and nothing else in the tailnet to reach it at all. ADR-0008 is
precise about why this is the primary control and not merely one of several: its control plane is
administered from outside the host it constrains, which no local firewall rule can claim. It is a
real control and it is not a boundary.

**The tailnet policy file does not exist and ADR-0008 requires it.** "The tailnet policy is versioned
in the repository and synced to Tailscale, not edited in the web console. Tailscale's default policy
permits everything, so the grant above does not exist until that file does, and a control that
important should not live somewhere with no history and no review." There is no such file in this
repository. Two rules are already live and were made in the console: ticket 15's `ssh` rule for
`autogroup:member` into `tag:proxy`, added on 2026-08-18 after Tailscale SSH was found dead on
arrival, and whatever `tagOwners` entry lets the proxy enrol. Both belong in the file along with this
ticket's grant. Split this to its own ticket if it grows, but do not let the grant land in the
console and stay there.

**What differs in the demo's `.env`, and nothing else does.** Per ADR-0001's surviving rule, a
tighter public instance is a different `.env` and never a different build:

- `TRUST_PROXY=2`, the hop count for CloudFront then nginx, both appending. Ticket 23 built the
  parsing and could not test the deployment.
- `SITE_NOTICE` set to the line saying the data is a Seed. Ticket 24 built the app half; this is
  where a value finally reaches it.
- `RECIPES_MAX=200`, against the 500 the Homelab Variant keeps.
- `CORS_ORIGIN=https://meal-prep.phillip-nguyen.dev`, the one origin the browser sends.
- `SEED_DATABASE_URL`, the owner role, because the restore truncates.
- Passwords generated fresh. A shared password turns the separation into decoration, and both
  stacks live in one checkout, so this is easier to get wrong here than it sounds.

**A trap in `.gitignore`.** It ignores `.env` exactly. It does not ignore `.env.demo`,
`.env.production` or anything else of that shape. A second env file added without touching that line
is one `git add .` from publishing the demo's database passwords in a public repository. Fix the
pattern in the same commit that introduces the file, not after.

**The restore timer is a security control.** `packages/api/src/seed.js` already exists: the API's own
image with a different command, truncate and reload, exits on a code a scheduler can hold it to.
Every six hours per ADR-0010, which lists it among security controls on purpose, because it clears
whatever an attacker stored and not only whatever a visitor accumulated. Its schedule is a security
parameter. `ops/backup/` has the systemd service-and-timer pattern to mirror, including the alert
path, and ticket 14 already learned that a missing env key must not kill the unit mute.

**The resource ceilings that replaced the AWS ones.** ADR-0010 is explicit that container memory and
CPU limits plus a cap on the Postgres volume size are what stand in for the Budgets alarm and the
task and storage ceilings, on hardware where the consequence of exhaustion is a full disk rather
than a bill. They are not optional and they are not in the Homelab Variant's file.

**The `DOCKER-USER` egress rules are host state.** They drop traffic from the demo network to private
address ranges other than its own database, which is the control that addresses lateral movement
while everything else addresses inbound. They have to survive a reboot, and how they are made to is
part of the deliverable rather than an implementation detail, because ticket 25 has to document them
as installed.

**Human-only, on the same grounds as 15 and 25.** The auth key is a secret, the tagged enrolment and
the `DOCKER-USER` chain are host state only the Operator can see, and the tailnet policy is a control
the Operator administers. The Compose file, the example env file and the `.gitignore` fix are
repository artifacts and could be split to an agent if the Operator would rather review than type;
the host half cannot.

**Blocked by:** None. 13 supplied the Compose shape and the image wiring, 24 supplied the notice the
`SITE_NOTICE` value feeds, 26 supplied the Seed the restore loads.

**Unblocks:** 15's four remaining verification boxes, 16's bundle half, and 25 in full.

- [ ] A second Compose project runs on the host with its own Postgres container, its own volume and
      its own network, tellable apart from `meal-prep` at the prompt
- [ ] Neither stack's `.env` shares a password with the other
- [ ] The demo API publishes no port on the host, and the only path to it is the sidecar
- [ ] The sidecar enrols tagged `tag:demo`, and the auth key never lands in the repository, in a
      log, or in a shell history
- [ ] A tailnet policy file is versioned in this repository and synced, carrying the
      `tag:proxy` to `tag:demo` grant, the existing `ssh` rule and the `tagOwners` entries
- [ ] `tag:proxy` reaches the demo API over the tailnet, and a third tailnet device does not
- [ ] The demo's `.env` sets `TRUST_PROXY=2`, `RECIPES_MAX=200`, the CloudFront origin in
      `CORS_ORIGIN`, and a `SITE_NOTICE` a visitor can read
- [ ] `.gitignore` covers the demo env file, verified with `git check-ignore`
- [ ] Container memory and CPU limits are set, and the Postgres volume has a size cap
- [ ] `DOCKER-USER` rules drop demo-network egress to private ranges except its own database, and
      survive a reboot
- [ ] The Seed restore runs on a six-hour timer as the owner role, and a failed run is noticed
      rather than silent
- [ ] Migrations apply before the API starts, the same gate ticket 13 documented

## Comments

**2026-08-20: the gap was found while trying to verify ticket 15, not while planning.** The Operator
believed the backend already existed, which is a reasonable thing to believe when three tickets and
two ADRs discuss it in the present tense. Worth recording as a tracker failure rather than a memory
one: ticket 25 names a blocker that does not deliver what it is blocked on, and nothing catches that.
