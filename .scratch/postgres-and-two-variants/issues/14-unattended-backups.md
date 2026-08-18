# 14 - Unattended backups

Status: ready-for-agent

**What to build:** Recovery stops depending on the Operator remembering anything. A nightly `pg_dump`
runs unattended, dated dumps are kept for about a month, a copy lives off the homelab so a dead disk
is not a total loss, and an alert fires when a dump is missing or zero bytes. No human in the loop.

Retention rather than review is what protects against corruption: a bad write destroys nothing if a
copy from before it is still held. This matters because Google Sheets has been providing offsite
versioned history for free, and a single container volume is a strict regression against that. That
is why this ticket blocks cutover rather than following it.

A silently broken backup must not be able to masquerade as a working one, so the zero-byte case gets
its own alert.

**Name the container this dumps, and exclude the demo's.** The host now runs two Postgres
containers: the Homelab Variant's, holding real personal data, and the Demo Variant's, holding Seed
data and whatever visitors leave behind
([ADR-0008](../../../docs/adr/0008-demo-backend-on-the-homelab.md)). Only the first is backed up.

Backing up seeded data would waste the offsite copy, and a dump with an ambiguous name is a dump
somebody restores into the wrong stack later. The Demo Variant's recovery story is the Seed restore
on its timer, not a backup, and it deliberately has no history worth keeping.

**Blocked by:** 13 (the Homelab Variant running).

- [ ] A dump runs on a nightly schedule with no human involved
      **Script side proven; installation is the Operator's.** `ops/backup/dump.sh` and
      `check-backup.sh` need no interactive input anywhere in their paths - every run in this
      ticket's verification, automated and manual, ran unattended and either succeeded or failed
      loudly with no prompt. `meal-prep-backup.timer` (`OnCalendar=*-*-* 02:30:00`,
      `Persistent=true`) is delivered but not installed: this sandbox has no systemd and no
      persistent host to observe a real 02:30 firing on. Remains for the Operator: runbook
      "Operator install steps" 4-6, which install the timer and trigger one run immediately rather
      than waiting for 02:30.
- [x] The dump names the Homelab Variant's container explicitly rather than assuming one exists
- [x] The Demo Variant's database is not dumped, and the dump filenames say which stack they came
      from
- [x] Dumps carry their date, and roughly thirty are retained before the oldest is dropped
- [x] A copy of each dump lands off the homelab
      Both `OFFSITE_DEST` forms were built (a local/mounted path via `cp`, `user@host:path` via
      `rsync` over `ssh`); only the local-path form ran for real in this sandbox, which has no
      `rsync` binary. Runbook install step 6 is where the Operator's actual destination gets its
      first real run.
- [x] A missing dump raises an alert that reaches the Operator
- [x] A zero-byte dump raises an alert rather than counting as success
- [x] A restore from a dump into an empty database is performed once and the steps recorded
- [x] The schedule and the alert path are documented in the runbook from ticket 13

## Comments

**Delivered.** `ops/backup/dump.sh` (nightly dump, retention, offsite copy), `ops/backup/check-backup.sh`
(the daily watchdog for a dump that never happened), `ops/backup/alert.sh` and `common.sh` (shared
logging and config loading), `ops/backup/backup.env.example`, and the four systemd units
(`meal-prep-backup.{service,timer}`, `meal-prep-backup-check.{service,timer}`). Plus
`test/backup.test.js` and the runbook's new "Backups" section.

**Two scripts, not one, because dump.sh's own alerting has a blind spot.** dump.sh alerts on a
missing container, a failed `pg_dump`, a zero-byte dump, and a failed offsite copy - every way the
dump it is making can go wrong. What it structurally cannot alert on is not running at all: the
host was off at 02:30, the timer was disabled, or it crashed before sourcing `alert.sh`. That
failure mode needed something outside the process that would have produced the dump, which is what
`meal-prep-backup-check.timer` at 09:00 is - see the "the daily check treats a dump missing for
today" test.

**The offsite destination is one setting with two transports rather than two settings.** rsync
already tells local paths and `user@host:path` apart by syntax, so `OFFSITE_DEST` just is that
string, `cp` when it holds a local path (a mounted NAS share is the expected case) and `rsync -e
ssh` when it holds `user@host:path` (a second machine over the tailnet). Detection requires an `@`
before the colon deliberately: a bare `host:path` would also match a Windows absolute path's drive
letter during testing, and requiring the user made the config more explicit anyway rather than
depending on whatever user the timer happens to run as.

**Genuinely open choice: ntfy for alerting.** Nothing in ticket 13's runbook or ADR-0008/0010
names a notification channel to build on - only Tailscale, which is transport, not alerting. Picked
[ntfy](https://ntfy.sh): one unauthenticated POST, no account, no paid service, push arrives on the
same phone that already carries Tailscale. The alternative considered was email, rejected because
this host runs no MTA and wiring one (or a third-party SMTP relay) is more infrastructure than a
backup alert justifies; it is still available later; `alert()` in `ops/backup/alert.sh` is the one
place that would change.

**Testing this needed a stand-in for `docker` itself, which this sandbox does not have on PATH.**
`@testcontainers/postgresql` already proves a real Docker Engine is reachable here (over
`//./pipe/docker_engine`, via `dockerode`) - that is how the rest of this repository's suite works
against real Postgres. What is missing is the `docker` CLI binary a shell can invoke, confirmed
absent from PowerShell, this sandbox's bash, and `node:child_process` alike. Since `dump.sh` and
`check-backup.sh` have to shell out to a real `docker` on the actual homelab host (the runbook
already requires one for Compose), `test/helpers/docker-shim/docker` forwards just the two
subcommands they call (`inspect --format`, `exec`) to the real daemon through `dockerode`, and is
prepended onto `PATH` only for the child process `test/backup.test.js` spawns. Neither script
knows it exists; a real host never has it on `PATH` to find.

**Verified by running, not only by inspection.** `test/backup.test.js`, ten tests (seven at first
pass, three more added in the review round below), all against a real disposable
`postgres:17-alpine` container: a non-empty dated dump landing both locally and offsite; a missing
container refusing the dump with a real alert POST received; retention pruning five pre-seeded
dumps down to three, oldest three gone; a missing `OFFSITE_DEST` failing the run; the daily check's
zero-byte, missing-dump, and healthy-dump paths, alert received or not received as each case
demands. Beyond the suite, a restore drill: `packages/api/migrations/` applied to a
throwaway container, two Recipes inserted, `dump.sh` run against it for a real 7,486-byte dump,
restored with `docker exec -i <target> psql -v ON_ERROR_STOP=1 -U <role> -d <db> < dump.sql` into a
second, empty container, and the two Recipes read back identical. Full transcript in the runbook's
"The restore drill".

**Not verified here, and it needs the Operator.** Nothing about a live systemd timer firing at
02:30, a live alert landing on a phone via the real `ntfy.sh`, or a real `rsync` over `ssh` to a
real second host - all genuinely need the real homelab host, which this sandbox is not. The
runbook's "Operator install steps" close each of these explicitly, including "break something on
purpose once" as the first real end-to-end check.

**Out of scope, flagged rather than fixed.** `docs/runbooks/homelab.md`'s "The data" section
previously said "Scheduled dumps are a separate job and this stack does not perform them" - now
points at the Backups section instead, which is the smallest edit that keeps the runbook honest;
nothing else in that file changed. `packages/` was not touched. Offsite retention (pruning old
copies at the far end) was deliberately left undone: the ticket asks for local retention of roughly
thirty, says nothing about the offsite side, and small personal-recipe-app dumps accumulating
offsite is a storage question for the Operator to raise later rather than a gap in this ticket.

**2026-08-17: two-axis review found four real bugs and two judgement calls; all fixed.** Verified
each independently before touching anything - one (the `read_env_value` bug below) reproduced in
isolation first, the rest confirmed by reading the actual code and unit files against the claim.
None were wrong.

*Spec axis:*

1. **`read_env_value` died mute under `set -euo pipefail`.** `grep -E "^${key}="` on a key the
   `.env` file does not carry exits 1; with `pipefail`, that is the whole pipeline's exit status
   even though `tail`/`cut` both succeed on the empty input, and a bare `VAR="$(read_env_value X)"`
   at top level lets that non-zero status kill the script before `fail()` is ever reachable - no
   log, no alert. Confirmed by reproducing it in isolation: an eight-line script with the same
   `grep | tail | cut` inside `$(...)` under `set -euo pipefail`, run against an env file missing
   the key, exits 1 before its own `echo "reached"` line runs. Since `compose.yaml` defaults
   `POSTGRES_DB` and `POSTGRES_OWNER_ROLE`, an Operator's real `.env` omitting either is normal, not
   an error - this was the exact "silently broken backup masquerading as working" the ticket
   forbids, one step earlier than the dump itself. Fixed with `|| true` on the pipeline in
   `read_env_value`, so a missing key now falls through to the `${VAR:-default}` handling already
   there; `POSTGRES_OWNER_PASSWORD`, which has no default, is still checked explicitly and still
   fails loudly if blank. New test: "a .env that omits POSTGRES_DB... still dumps rather than
   dying mute".
2. **Watchdog false-positive after a missed-night boot.** Both timers are `Persistent=true` with no
   ordering between them, so a host catching up both missed jobs around boot could run the check
   before the dump finishes writing and alert "missing" on a run still in progress. Fixed with
   `After=meal-prep-backup.service` on the check service - ordering only, not a `Requires=`, so it
   has no effect unless both are actually starting around the same moment, does not pull the backup
   in on its own, and does not require the backup to have succeeded, only to have finished, so a
   real failure still reaches the watchdog. Documented in the runbook next to the timer table.
3. **The `rsync` offsite branch never created the remote directory** (the `cp` branch already did
   `mkdir -p`), so a first real run against an untouched destination would fail. Fixed with an
   explicit `ssh ... mkdir -p` before the transfer, chosen over rsync's own `--mkpath` because that
   flag needs rsync 3.2.3 or newer on the offsite host and nothing here should assume a version
   there. Noted in the runbook's "Offsite copy" paragraph. Still unverified end-to-end in this
   sandbox - no `rsync` binary here, same limitation already recorded against the offsite checkbox.
4. **Blank `NTFY_TOPIC` degraded to a log line while blank `OFFSITE_DEST` hard-failed** -
   inconsistent, and the ticket makes the alert load-bearing ("a missing dump raises an alert that
   reaches the Operator"), not optional. Fixed with `require_alert_channel()` in `alert.sh`, called
   at the top of both scripts right after config loads, exiting 1 before either script touches the
   database, the container, or the filesystem if `NTFY_TOPIC` is blank. Two new tests, one per
   script. This also meant every existing test needed `NTFY_TOPIC` set just to get past the new
   check - `runScript`'s env now defaults it to a placeholder topic, and the "missing offsite
   destination" test picked up its own alert stub in the process, since it now genuinely triggers
   `alert()` where it previously hit the no-topic early return.

*Standards axis:*

5. **Two banned-vocabulary uses of "production"** (`backup.env.example`, the runbook's Alerting
   paragraph) - `CONTEXT.md` names it explicitly under the Homelab Variant's `_Avoid_` list. Both
   reworded; the runbook one was also stale by then anyway, since it still described the old
   log-instead-of-send behaviour finding 4 replaced.
6. **Two judgement calls, stated rather than silently picked:**
   (a) Both `.service` units run as root - no `User=`. `docker exec` needs the Docker socket, which
   on stock Ubuntu means root or the `docker` group, and shipping an untested service-account setup
   this checkout cannot create on the Operator's host felt worse than documenting the choice. Left
   as root, with a "Running as root" paragraph in the runbook naming the tightening path (a
   dedicated user in the `docker` group, `chown` on `BACKUP_DIR` and the offsite SSH key,
   `User=`/`Group=` in both files) for an Operator who wants it.
   (b) The zero-byte `stat` check was duplicated verbatim between `dump.sh` and `check-backup.sh`.
   Deduplicated into `file_size()` in `common.sh`, used by both.

Three new tests, ten total, still all green. Full suite: 261 + 23 + 10 + 10 = 304 passing; the one
pre-existing `test/compose.test.js` failure (`docker` CLI absent from this sandbox's `PATH`) is
unchanged from before this ticket and unrelated to it.
