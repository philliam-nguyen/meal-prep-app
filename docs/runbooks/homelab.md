# Runbook: the Homelab Variant

The Homelab Variant is `compose.yaml` on a host you keep running, reached over Tailscale. Compose
publishes the API on the host's loopback address and nothing else; `tailscale serve` terminates TLS
on the `ts.net` name and proxies to that port. Tailnet membership is the whole authorization model,
which is what `docs/adr/0003-no-application-auth.md` decided and why.

This runbook covers bringing the stack up, running migrations, putting it on the tailnet, and
checking that it is reachable from exactly one place.

## Before you start

- A host with Docker Engine and the Compose plugin, running Tailscale and logged in to the tailnet.
- HTTPS certificates enabled for the tailnet, on the DNS page of the Tailscale admin console.
  `tailscale serve` needs them and offers to enable them the first time you run it.
- Both phones already on the tailnet.
- An image reference to put in `MEAL_PREP_IMAGE`. Until a pipeline publishes one, build it on the
  host from a checkout, once `.env` exists to name the tag:
  `docker compose -f compose.yaml -f compose.build.yaml build`. That produces the tag
  `MEAL_PREP_IMAGE` names, so a local build and a pull are the same artifact under the same name.

The host needs `compose.yaml` and a `.env` beside it, and `compose.build.yaml` plus the source as
well if it is where you build the image. A git checkout gets you all of it, and `.env` is the one
file you write yourself.

## Passwords and the connection string

`.env` holds the only passwords in the deployment. Copy it from the example and fill in two:

```
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # once per password
chmod 600 .env
```

No connection string is written down anywhere. `compose.yaml` assembles both from parts in `.env`,
one for the migration step as the owner role and one for the API as a restricted role that cannot
change the schema. `.env` is gitignored and stays on the host: not in the repository, not in a
commit, not in a paste to yourself.

Four values matter beyond the passwords:

| Value | Homelab setting |
| --- | --- |
| `MEAL_PREP_IMAGE` | the published tag you intend to run, pinned, never `latest` |
| `CORS_ORIGIN` | `https://<host>.<tailnet>.ts.net`, no port, exactly as the phone's browser sends it |
| `TRUST_PROXY` | `true` |
| `API_PORT` | `8080`, and the rest of this runbook assumes it. Change it and the `tailscale serve` command below has to name the same number |

`TRUST_PROXY` is `true` here because `tailscale serve` is the only thing that can reach the port,
and it replaces `X-Forwarded-For` with the calling tailnet address rather than appending to
whatever the caller sent. Leave it `false` and both phones share one rate-limit bucket keyed on
`127.0.0.1`.

Get `CORS_ORIGIN` wrong and the app refuses its own saves rather than only refusing other sites.
Browsers attach an `Origin` to same-origin writes too.

## Bring-up

```
docker compose up -d
```

Postgres starts, the migration step runs to completion, then the API starts. Compose gates each on
the one before it, so on a first bring-up, and on any later one that replaces the API container, a
failed migration leaves the API created and never started rather than serving against a schema it
does not match.

```
docker compose ps
curl -sf http://127.0.0.1:8080/api/health
```

The gate is narrower than it looks, and the difference matters when you are debugging at the stove.
Running `docker compose up -d` against a stack that is already up does not replace the API
container, so the migration step reruns underneath an API that keeps serving. Compose exits 1 and
says which service failed, and the API is still up when it does. Read the exit code.

## Migrations

Every `docker compose up -d` runs the migration step. It applies anything pending, and finds nothing
to do when there is nothing pending, so a migration only ever arrives with the image that needs it.
To run it on its own:

```
docker compose run --rm migrate
```

The migration step is the only container that holds the owner password or has any DDL rights. It
runs the same image as the API with a different command, so there is no second artifact to keep in
step.

## Put it on the tailnet

```
tailscale serve --bg 8080
tailscale serve status
```

That serves HTTPS on the `ts.net` name and proxies to `127.0.0.1:8080`, with a real certificate
Tailscale provisions and renews. The number is `API_PORT`, so the two have to agree. The
configuration survives a reboot. To undo it:

```
tailscale serve reset
```

Never run `tailscale funnel`. Funnel publishes the same service to the public internet, and this
app has no login of its own. Public ingress invalidates ADR-0003 rather than amending it, so that
is a decision to make in the ADR first and the CLI second.

## Check the boundary

Four checks, and the last two are the ones people skip:

1. On a phone on the tailnet, open `https://<host>.<tailnet>.ts.net`. The certificate is valid, the
   recipes load, and adding one works.
2. Repeat on the second phone.
3. From another machine on the local network, `curl http://<host-lan-address>:8080/api/health`
   must fail to connect. Compose publishes to loopback only, so a LAN device reaching it means
   something has changed the port binding.
4. From a phone on mobile data with Tailscale off, the `ts.net` name must not answer.

## Upgrading

Set the new tag in `MEAL_PREP_IMAGE` and run `docker compose up -d`. Compose pulls it, reruns the
migration step, and recreates the API container. Rolling back is the old tag and the same command,
as long as the migrations in between were additive.

## The data

Postgres writes to the named volume `meal-prep_database`. Recreating containers keeps it, which is
what `docker compose down` followed by `docker compose up -d` does. `docker compose down -v`
deletes it, and there is no host directory to recover it from. The nightly backup below is what
makes that survivable.

## Backups

Ticket 14. Recovery does not depend on the Operator remembering anything: a nightly `pg_dump` of
the Homelab Variant's Postgres container, dated and named for the stack, roughly a month retained,
copied off the homelab, with an alert if a dump goes missing or comes back zero bytes. The scripts
live in `ops/backup/` in this checkout.

**Only the Homelab Variant is dumped.** `ops/backup/dump.sh` names the container it dumps
explicitly (`HOMELAB_DB_CONTAINER`, default `meal-prep-db-1` - what Compose calls this stack's `db`
service under the project name `meal-prep`) and refuses to run rather than falling back to
"whatever Postgres is running" if that container is not there. The Demo Variant's Postgres
container is never named and never dumped: it has no history worth keeping, and its recovery story
is the Seed restore timer on its own schedule
([ticket 12](../../.scratch/postgres-and-two-variants/issues/12-seed-fixture-and-restore.md),
[ADR-0008](../adr/0008-demo-backend-on-the-homelab.md)). A dump with an ambiguous name is a dump
somebody restores into the wrong stack later, which is why filenames carry the stack name and the
date: `homelab-variant_YYYY-MM-DD.sql`.

**What runs, and when.**

| Unit | Schedule | Does |
| --- | --- | --- |
| `meal-prep-backup.timer` → `meal-prep-backup.service` | nightly, 02:30 | Runs `ops/backup/dump.sh`: dumps the named container, refuses and alerts on a missing container, refuses and alerts on a zero-byte dump, prunes local dumps past `RETENTION_COUNT` (default 30), copies the new dump offsite, alerts and exits non-zero on any failure including a failed offsite copy. |
| `meal-prep-backup-check.timer` → `meal-prep-backup-check.service` | daily, 09:00 | Runs `ops/backup/check-backup.sh`: alerts if no dump exists for today at all, or if it exists at zero bytes. This is the watchdog for the failure dump.sh's own alerting cannot catch - the run that never happened because the host was off, the timer was disabled, or the script died before it could alert. |

Both timers set `Persistent=true`: a host that was off at its scheduled time runs the job once on
the next boot rather than waiting silently for the next day.

**Alerting.** A push notification through [ntfy](https://ntfy.sh) - a single unauthenticated HTTP
POST, no account, no paid service. `NTFY_TOPIC` in `backup.env` is a long random string standing in
for a password: anyone who knows it can publish to it and read its history, so it is generated per
install and never committed. The Operator subscribes to that topic in the ntfy phone app (or at
`https://ntfy.sh/<topic>` in a browser) before the first real run. Left blank, alerts are logged
instead of sent - a deliberate choice for a dry run, wrong to leave that way in production.
Considered and not taken: email, which would need an MTA or a third-party relay configured on a
host that has neither today; a self-hosted ntfy instance remains open if the public one is ever a
concern, and `NTFY_URL` in `backup.env` is exactly the setting that repoints it.

**Offsite copy.** `OFFSITE_DEST` in `backup.env` is either a local path - typically a NAS share
already mounted on this host, copied with `cp` - or `user@host:path`, copied with `rsync` over
`ssh` reached over the tailnet the same way everything else here is reached, with a key rather than
a password (`BatchMode=yes` refuses to prompt for one). This is required, not best-effort:
`dump.sh` fails and alerts if `OFFSITE_DEST` is not configured, because a dump that stays local
only is not what "a copy lands off the homelab" means.

### Operator install steps (run once, on the host)

Everything above is delivered as files in this checkout. Installing the timers, choosing the
offsite destination, and subscribing to alerts happen on the real host and are not things this
repository can do for you.

1. `cp ops/backup/backup.env.example ops/backup/backup.env` and fill in `OFFSITE_DEST` and
   `NTFY_TOPIC`. `chmod 600 ops/backup/backup.env` - it is gitignored, and stays on the host like
   `.env` does.
2. Subscribe to `NTFY_TOPIC` in the ntfy app (or the web UI) before doing anything else, so a test
   alert has somewhere to land.
3. Confirm `HOMELAB_DB_CONTAINER` matches reality: `docker compose ps db` and check the container
   name. It is `meal-prep-db-1` unless something unusual has changed it.
4. `sudo cp ops/backup/*.service ops/backup/*.timer /etc/systemd/system/` and edit the
   `WorkingDirectory=` / `ExecStart=` paths in the two `.service` files to match where this
   checkout actually lives on the host.
5. `sudo systemctl daemon-reload && sudo systemctl enable --now meal-prep-backup.timer meal-prep-backup-check.timer`
6. `sudo systemctl start meal-prep-backup.service` to run one dump immediately rather than waiting
   for 02:30, then `journalctl -u meal-prep-backup.service -n 50` to read what it did. A dump
   should appear under `BACKUP_DIR` and at `OFFSITE_DEST`.
7. Break something on purpose once: stop the database container (`docker compose stop db`) and run
   `sudo systemctl start meal-prep-backup.service` again. It should fail, log the reason, and the
   ntfy alert should arrive on the phone. Start the database back up afterward.

### The restore drill

Performed once, against a throwaway container, not against either running stack. Steps and actual
output, recorded here rather than only claimed:

A source container was started fresh (`postgres:17-alpine`), the three files in
`packages/api/migrations/` were applied against it, and two Recipes were inserted directly:

```
insert into recipes (name, type) values ('Tomato Soup', 'soup'), ('Roast Chicken', 'dinner');
```

`ops/backup/dump.sh` was pointed at that container and produced a real dump:

```
starting dump of meal-prep-restore-drill-source (homelab-variant) to .../homelab-variant_2026-08-17.sql
dump written: .../homelab-variant_2026-08-17.sql (7486 bytes)
copied homelab-variant_2026-08-17.sql offsite to .../offsite
backup complete for 2026-08-17
```

A second container was started, from the same image, with no migrations applied and no data - an
empty database. The restore is one command, the same one this section asks the Operator to use for
real:

```
docker exec -i <target-container> psql -v ON_ERROR_STOP=1 -U <owner-role> -d <db> < homelab-variant_YYYY-MM-DD.sql
```

`RESTORE EXIT:0`. Querying the target afterward:

```
select id, name, type from recipes order by id;

 id  |     name      |  type
-----+---------------+--------
R001 | Tomato Soup   | soup
R002 | Roast Chicken | dinner
(2 rows)
```

Identical to the source. `ON_ERROR_STOP=1` matters more than it looks: without it, `psql` keeps
going past a failed statement and a partially-applied restore can still exit 0.

If the target database is not actually empty - a stale volume, a container reused by mistake - the
restore is not idempotent the way `dump.sh` is: a plain-SQL dump re-creates tables that already
exist and fails loudly on the first `CREATE TABLE`, rather than silently overwriting or merging.
That is the correct failure for this case. Recreate the target from a fresh volume first
(`docker compose down -v` on a throwaway stack, never on the real one) rather than restoring twice
into the same database.

## When something is wrong

- **The API container restarts in a loop.** `docker compose logs api`. A missing or unparseable
  guardrail value fails at startup by design.
- **The API never starts.** `docker compose logs migrate`. The migration step logs the whole error
  because it runs unattended and its log is the only account of what happened.
- **Saves fail from the phone but reads work.** `CORS_ORIGIN` does not match the URL in the address
  bar. Scheme, host, and port all count.
- **`tailscale serve` answers with 502.** The API is not up on port 8080. Check `docker compose ps`
  and the health endpoint on the host first.
- **A backup alert arrived.** `journalctl -u meal-prep-backup.service -n 50` (or
  `-u meal-prep-backup-check.service` for a missing-dump alert) has the full error - both scripts
  log everything they did, because nobody is watching when they run. A missing-container failure
  means `HOMELAB_DB_CONTAINER` or the actual container name has drifted; check with
  `docker compose ps db`. A failed offsite copy means `OFFSITE_DEST` is unreachable - test the
  `ssh` or the mounted path by hand.
