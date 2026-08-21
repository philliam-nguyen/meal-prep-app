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

- [x] A second Compose project runs on the host with its own Postgres container, its own volume and
      its own network, tellable apart from `meal-prep` at the prompt
- [x] Neither stack's `.env` shares a password with the other
- [x] The demo API publishes no port on the host, and the only path to it is the sidecar
- [x] The sidecar enrols tagged `tag:demo`, and the auth key never lands in the repository, in a
      log, or in a shell history
- [x] A tailnet policy file is versioned in this repository and synced, carrying the
      `tag:proxy` to `tag:demo` grant, the existing `ssh` rule and the `tagOwners` entries
- [x] `tag:proxy` reaches the demo API over the tailnet, and a third tailnet device does not
- [x] The demo's `.env` sets `TRUST_PROXY=2`, `RECIPES_MAX=200`, the CloudFront origin in
      `CORS_ORIGIN`, and a `SITE_NOTICE` a visitor can read
- [x] `.gitignore` covers the demo env file, verified with `git check-ignore`
- [x] Container memory and CPU limits are set on the demo's db and api containers
- [ ] The Postgres volume has a size cap, installed on the host rather than only scripted
- [x] `DOCKER-USER` rules drop demo-network egress to private ranges except its own database
- [ ] Those rules survive a reboot, checked after one rather than assumed from `systemctl enable`
- [x] The Seed restore runs on a six-hour timer as the owner role
- [x] A failed restore is noticed rather than silent: the journal records it and the alert path
      delivers, proven with a controlled failure rather than read off the code
- [x] Migrations apply before the API starts, the same gate ticket 13 documented

## Comments

**2026-08-20: the gap was found while trying to verify ticket 15, not while planning.** The Operator
believed the backend already existed, which is a reasonable thing to believe when three tickets and
two ADRs discuss it in the present tense. Worth recording as a tracker failure rather than a memory
one: ticket 25 names a blocker that does not deliver what it is blocked on, and nothing catches that.

**2026-08-20: the stack is up, and six boxes close on evidence rather than on inspection.**
`docker compose ls` shows two projects; the demo's volumes are `meal-prep-demo_database` and
`meal-prep-demo_tailscale` and its network `meal-prep-demo_default`, all distinct from the Homelab
Variant's. `docker compose config` renders zero `ports:` keys and `docker ps` shows no published
port on the API. The sidecar enrolled at `100.78.72.5` tagged `tag:demo`, and the migration
container exited cleanly before the API started, which is ticket 13's gate holding on a second
stack.

The grant was tested in both directions in the same minute, which is the habit ticket 12 established
and ticket 13 applied to a deployment. From the AWS proxy,
`curl http://100.78.72.5:8080/api/health` answers `200`. From a third tailnet device that is neither
tagged nor the proxy, the same request answers `000`, curl's code for never having connected. A
positive test alone would have proven only that something answers.

**Two build corrections worth keeping.** The sidecar needs `TS_DEBUG_FIREWALL_MODE=nftables`.
Ubuntu's iptables is the nftables backend and the container defaults to the legacy binary, which
fails to create Tailscale's chains with "Table does not exist"; tailscaled carries on and enrols
anyway, so the symptom is a health warning and absent firewall rules rather than a container that
stops. It is invisible unless the log is read.

And `meal-prep-app:local` on the host predated ticket 23, so the API crash-looped on
`TRUST_PROXY must be "true" or "false", got "2"`. `git pull` updates the source and changes nothing
about what runs. Until ticket 16 publishes to GHCR, a pull needs a rebuild beside it, and the tag
is shared with the Homelab Variant, so the rebuild is a change to both stacks at their next
recreate.

**Not closed, and why.** The volume size cap ADR-0010 asks for is not expressible in Compose's local
driver, so it stays host state and is still absent. The `DOCKER-USER` rules and the restore timer
are not built. The password box wants one look at the two `.env` files rather than an assumption,
and the auth-key box wants a decision recorded: `TS_AUTHKEY` reaches the container as an environment
variable, so it is visible to `docker inspect` on the host, which is a weaker posture than ticket
15's SSM parameter and should be written down as accepted rather than left unnoticed.

**Unrelated, and the host is now load-bearing.** PID 1 segfaulted on this machine during the work,
in `libsystemd-shared-259.so`, after containerd failed to start three times in fifteen seconds. The
host stayed up for ten days before it and the containers kept running throughout, because the shims
outlive containerd. Recovered with a reboot. `systemd-coredump` is not installed, so there is no
dump. What killed containerd first is unknown and is the root cause; the systemd crash looks like a
consequence of the restart loop. ADR-0008 already accepts that the demo depends on this host, but it
assumed the failure mode was power and internet rather than the init system.

**2026-08-20: one chain was not enough, and the test that said otherwise was wrong twice.**
`DOCKER-USER` sits in FORWARD, so it governs traffic routed *through* the host: other LAN devices,
other Docker networks. Traffic addressed to the host itself is delivered locally through INPUT and
never reaches DOCKER-USER at all. With only DOCKER-USER installed, a demo container reached
`192.168.50.106:22` on the first try. The rules now go into both chains, seven in total, and the
script fails loudly if it does not end with exactly that many.

Two wrong tests preceded the right one, and both are worth keeping because both looked like passes.
The first aimed at the Homelab Variant's Postgres on another Docker network and came back blocked
before any rule existed: Docker already isolates separate user-defined bridge networks, so that
test could never have failed. The second aimed at the host and came back reached with five rules
installed, which read as the rules not working when it was actually the chain being wrong. A
control tested only against a target that was already unreachable is a control with no evidence
behind it.

Proven in the same session, rules present and counted at test time: the host's sshd blocked, the
router at `192.168.50.1:80` blocked, the demo API still healthy against its own Postgres, and the
AWS proxy still answering 200 through the tailnet. The last two are what catch an over-broad rule,
and a flat INPUT drop is the blunt option, so they matter more than the two negatives.

**What DOCKER-USER cannot do, recorded rather than discovered later.** These rules constrain the
demo *network*. They say nothing about a process that escapes the container onto the host, which is
the risk ADR-0010 accepts rather than mitigates. Two host-side bindings are load-bearing alongside
them: ticket 13's decision to bind the Homelab Variant's API to `127.0.0.1` means a demo container
reaching the host's LAN address finds nothing listening there, and ADR-0010's requirement that the
local model runtime stay bound away from the network is now a control rather than tidiness.

**2026-08-20: the restore runs, and the stack answers end to end.** `systemctl start
meal-prep-seed-restore` emptied every table but the migration record, then loaded 19 Recipes, 7
Staples, 5 Pantry ticks, 2 Selected Recipes and marked every seeded Recipe Protected, in about a
second. The timer lists its next run at 00:00. Ticket 26's Pantry ticks are in the restore, so a
Reviewer arriving at any hour gets a populated Best Matches rather than an empty one.

End to end from outside: `curl http://100.78.72.5:8080/api/state` run *on the AWS proxy* returns
the Seed with `protected: true` on the Recipes. That is the full inner path of the Demo Variant
working, CloudFront and nginx excepted, and those two are ticket 15's.

**The alert path is the honest gap in the restore.** The script exits non-zero and systemd marks
the unit failed, so the journal has it. Nothing tells anyone. Ticket 14 built `ops/backup/alert.sh`
for exactly this and this unit does not use it, which matters more here than for a backup: ADR-0010
says the restore is the control bounding how long anything an attacker stored survives, and a
control that silently stops running is worse than one that was never installed. An `OnFailure=`
pointing at the existing alert path would close it.

**2026-08-20: the Site Notice is in the payload, and the alert path is wired.** `GET /api/state`
through the AWS proxy carries
`"notice":"This is a public demo. The data is a fixture and it is restored every six hours."`, so
ticket 24's app half is reading this Variant's `.env` rather than a default. `TRUST_PROXY=2` is
proven by the API starting at all: `flagOrHopCount` throws on anything that is not `true`, `false`
or a positive integer, so a process that came up read the hop count.

The restore now alerts through ticket 14's `ops/backup/alert.sh` rather than growing a second
channel, on both failure paths: a run that fails, and a run that cannot start because a file is
missing. The second is the quieter one, since the timer keeps firing and every run exits 1.

It deliberately does *not* call `require_alert_channel()`, which ticket 14's scripts do. That
refuses to start when no channel is configured, on the grounds that a backup nobody hears about is
worse than none. The reasoning inverts here: ADR-0010 makes this restore the control bounding how
long anything an attacker stored survives, so refusing to run because ntfy is unset would trade a
real control for a reporting one. `alert()` already logs loudly when it has nowhere to send.

The files being under `ops/backup/` while a non-backup script sources them is untidy and recorded
rather than fixed: what they actually are is this host's one way of reaching the Operator. Worth
moving to `ops/common/` next time either is touched, which is a change to ticket 14's delivered
work and so not this ticket's to make.

**2026-08-20 evening: no password is shared, checked as hashes rather than by eye.** Every value in
both `.env` files was hashed and compared without printing a secret. The two stacks share exactly
one value, `MEAL_PREP_IMAGE`, which is the intended state until ticket 16 splits the tags. Both
passwords, both role names and both database names are distinct between the files.

**2026-08-20 evening: the auth key posture was changed rather than accepted.** `TS_AUTHKEY` reached
the sidecar as an environment variable, so `docker inspect` on the host revealed it, a weaker
posture than ticket 15's SSM parameter. The fix is that the key is only needed at first enrolment:
the enrolled identity lives in the `meal-prep-demo_tailscale` volume, so the key was removed from
`.env.demo` (a comment marks where it goes for the next enrolment), made optional in
`compose.demo.yaml`, and the sidecar recreated. `docker inspect` now shows `TS_AUTHKEY=` empty, the
node came back at the same `100.78.72.5` tagged `tag:demo`, and the grant was retested in both
directions in the same minute: `curl` from the AWS proxy answers `200`, from this untagged host
`000`. The reusable key itself now exists only in the Tailscale admin console until its expiry;
re-enrolment after a volume loss means minting a fresh one there. Honest note for the record: the
key sat in `.env.demo` and in the container environment from first enrolment until today.

**2026-08-20 evening: the alert path is proven, not just wired.** A controlled failure
(`ENV_FILE=/nonexistent bash ops/seed-restore/restore.sh`) exited 1, logged the FATAL line, and the
ntfy topic read back a message titled "meal-prep demo Seed restore cannot run" when polled from the
server. That is the missing-file path end to end; the failing-run path uses the same `alert()` on
the same channel. A second restore run straight after finished clean, so the test left nothing
behind.

**2026-08-20 evening: the volume cap is scripted and awaiting one sudo run.** The root filesystem
is ext4, so of ADR-0010's two mechanisms the loopback image is the available one.
`ops/demo-volume/install-volume-cap.sh` builds a 2G loopback ext4 image at
`/var/lib/meal-prep-demo/pgdata.img`, mounts it via `/etc/fstab` ordered before `docker.service`,
and swaps `meal-prep-demo_database` onto a bind of a directory inside it; the compose file now
declares the volume that way. 2G because a fresh Postgres 17 cluster is ~40M and default
`max_wal_size` lets WAL alone approach 1G, so smaller risks capping normal operation instead of a
runaway. The swap discards the demo database, which costs one Seed restore, and the script runs it.
The mountpoint is left immutable while unmounted, so a missing mount at boot is a db container that
refuses to start and a restore that alerts, never silent uncapped writes. Verified today that
`docker compose config` accepts the new volume definition and a full restore runs clean against the
existing volume, so nothing breaks before the script is run; until it is run, the cap does not
exist and the box above stays open.

**Post-reboot checklist for the two boot-survival claims, for whichever reboot comes first:**
`sudo iptables-save -t filter | grep -cF -- '--comment meal-prep-demo-egress'` must print 7,
`findmnt /var/lib/meal-prep-demo/pgdata` must show the loop mount (only after the install script
has run), and `curl http://100.78.72.5:8080/api/health` from the AWS proxy must answer 200.
