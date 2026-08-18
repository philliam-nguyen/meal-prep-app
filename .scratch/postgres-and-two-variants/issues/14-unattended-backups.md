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

**Verified by running, not only by inspection.** `test/backup.test.js`, seven tests, all against a
real disposable `postgres:17-alpine` container: a non-empty dated dump landing both locally and
offsite; a missing container refusing the dump with a real alert POST received; retention pruning
five pre-seeded dumps down to three, oldest three gone; a missing `OFFSITE_DEST` failing the run;
the daily check's zero-byte, missing-dump, and healthy-dump paths, alert received or not received
as each case demands. Beyond the suite, a restore drill: `packages/api/migrations/` applied to a
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
