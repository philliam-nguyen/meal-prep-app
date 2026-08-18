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
- [ ] The dump names the Homelab Variant's container explicitly rather than assuming one exists
- [ ] The Demo Variant's database is not dumped, and the dump filenames say which stack they came
      from
- [ ] Dumps carry their date, and roughly thirty are retained before the oldest is dropped
- [ ] A copy of each dump lands off the homelab
- [ ] A missing dump raises an alert that reaches the Operator
- [ ] A zero-byte dump raises an alert rather than counting as success
- [ ] A restore from a dump into an empty database is performed once and the steps recorded
- [ ] The schedule and the alert path are documented in the runbook from ticket 13
