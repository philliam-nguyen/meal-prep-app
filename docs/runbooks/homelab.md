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
- An image reference to put in `MEAL_PREP_IMAGE`. The pipeline (ticket 16) publishes
  `ghcr.io/philliam-nguyen/meal-prep-app` on every push to `main`, tagged with the commit SHA and a
  moving `main`; pin the SHA, never `main` or `latest`. Pulling needs no credential because the
  package is public. That visibility is inherited from the repository being public, so it flips
  silently if the repository ever goes private - a pull refused with "denied" months from now means
  check the package's visibility in GitHub's package settings first, not the credentials. To build
  locally instead (a checkout with `.env` beside it):
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

## Two stacks on one host

Ticket 25. The Demo Variant's API and Postgres run on this same machine, in a Compose project of
their own ([ADR-0008](../adr/0008-demo-backend-on-the-homelab.md)). The isolation between the two
stacks is real and it is not structural: they share a kernel, a Docker daemon, a filesystem and a
root user. [ADR-0010](../adr/0010-demo-guardrails-on-shared-hardware.md) states what is being
accepted there and on what grounds, and this section does not re-argue it. What this section does
is record the separating controls as they are actually installed, from the host, as of 2026-08-21.

### Telling them apart at the prompt

One checkout serves both projects, so the directory tells you nothing; the Compose project name is
the distinguisher, and everything Docker creates carries it as a prefix.

```
docker compose ls
NAME             CONFIG FILES
meal-prep        compose.yaml, compose.build.yaml
meal-prep-demo   compose.demo.yaml
```

|                  | Homelab Variant                    | Demo Variant                                          |
| ---------------- | ---------------------------------- | ----------------------------------------------------- |
| Compose project  | `meal-prep` (`compose.yaml`)       | `meal-prep-demo` (`compose.demo.yaml`)                |
| Containers       | `meal-prep-api-1`, `meal-prep-db-1` | `meal-prep-demo-api-1`, `meal-prep-demo-db-1`, `meal-prep-demo-tailscale-1` |
| Postgres volume  | `meal-prep_database`               | `meal-prep-demo_database` (`meal-prep-demo_tailscale` holds sidecar state) |
| Network          | `meal-prep_default`                | `meal-prep-demo_default`                              |
| Host ports       | `127.0.0.1:8080`                   | none; ingress is its own `tailscale` sidecar          |
| Env file         | `.env`                             | `.env.demo`                                           |

Both Postgres containers run `postgres:17-alpine`, so the image column of `docker ps` cannot tell
them apart; the name always can. To see one stack alone:
`docker ps --filter label=com.docker.compose.project=meal-prep-demo` (the label is an exact match,
so `meal-prep` does not also catch the demo). Compose commands aimed at the demo take
`-f compose.demo.yaml --env-file .env.demo`; a bare `docker compose` in this directory is the
Homelab Variant.

One volume is not like the others. `meal-prep-demo_database` binds into
`/var/lib/meal-prep-demo/pgdata/data`, which sits inside a fixed-size 2 GiB loopback ext4 image
mounted from `/etc/fstab` before `docker.service`. That mount is ADR-0010's cap on how big the
demo's database can grow (`ops/demo-volume/`); `df -h /var/lib/meal-prep-demo/pgdata` shows the
ceiling and how close it is. The Homelab Variant's volume is an ordinary named volume with no cap.

### No shared password

`.env` and `.env.demo` sit side by side, use the same variable names (`POSTGRES_OWNER_PASSWORD`,
`APP_DB_PASSWORD`), and hold different values - generated separately, per the Passwords section
above, and confirmed different on the host by comparing hashes rather than reading them. Sharing
one would turn the separate-Postgres design into decoration: a credential read out of one stack
must be worth nothing in the other. Both files are `chmod 600`, stay on the host, and are never
committed.

### The egress rules, as installed

`meal-prep-demo-egress.service` is enabled and runs `ops/demo-egress/egress-rules.sh` after
`docker.service` on every boot. That re-run *is* the reboot-survival story: the rules are not saved
with `iptables-persistent`, deliberately, because `DOCKER-USER` is a chain Docker creates at start
and rules restored before Docker exists vanish. The script reads the demo network's subnet live
from Docker (`172.19.0.0/16` as of 2026-08-21; a recreated network can land elsewhere, which is why
it is never hardcoded) and installs seven rules, each marked `--comment meal-prep-demo-egress`,
across two chains - two chains because `DOCKER-USER` sits in FORWARD and never sees host-destined
traffic.

In `DOCKER-USER` (traffic routed through the host: other LAN devices, other Docker networks), in
evaluation order: replies on established connections RETURN, so answering the AWS proxy is never
mistaken for reaching out; demo subnet to its own subnet RETURN, so the API reaches its own
Postgres; then demo subnet to `10.0.0.0/8`, `172.16.0.0/12` and `192.168.0.0/16` all DROP. In
`INPUT` (the host itself, on every address it holds): established replies ACCEPT, everything else
from the demo subnet DROP - a flat drop rather than a list of exceptions, because the host serves
nothing the demo stack needs. Net effect: the demo network reaches the internet and its own
containers, and no private address beyond that.

```
systemctl status meal-prep-demo-egress        # active (exited) and the last run's exit status
journalctl -u meal-prep-demo-egress -b        # "installed 7 rules across DOCKER-USER INPUT"
sudo iptables -S DOCKER-USER | grep meal-prep-demo-egress   # the live chain itself
```

The script exits 1 and logs FATAL if it counts anything other than seven marked rules, or if the
demo network is missing entirely, so a green unit is itself evidence the control is on.

### The local model runtime

The other tenant on this host is LM Studio, a per-user install under `/home/llm/.lmstudio`. As
installed, its API server is not running at all: no process, no listening socket, and the
serve-on-local-network setting has never been switched on, so starting the server binds
`127.0.0.1:1234` rather than the LAN. Recorded here as a control, not an accident: an open model
endpoint would be an unauthenticated service sitting inside the boundary the rules above draw. The
check, after any LM Studio upgrade or settings visit:

```
ss -ltn 'sport = :1234'    # expect nothing; if the server is on, the address must be 127.0.0.1
```

### The Seed restore is a security control

`meal-prep-seed-restore.timer` is enabled: `OnCalendar=00,06,12,18:00:00`, with
`RandomizedDelaySec=120` and `Persistent=true` so a host that was off at the slot restores once on
the next boot. It runs `ops/seed-restore/restore.sh`, which runs the demo Compose file's `seed`
service - the API's own image running `packages/api/src/seed.js`, truncate and reload. Its
credential is the *demo* owner role: `compose.demo.yaml` assembles `SEED_DATABASE_URL` from
`POSTGRES_OWNER_ROLE` and `POSTGRES_OWNER_PASSWORD` in `.env.demo`, owner because truncating is
exactly what the restricted role exists to be unable to do, and nothing of the Homelab Variant's
`.env` is involved. This is a security control and not housekeeping: the restore clears whatever an
attacker stored along with whatever a visitor accumulated, so the six-hour interval is the longest
anything planted in the Demo Variant survives. Lengthening it is a security change and belongs in
ADR-0010's terms, not in a quick edit to the timer. `systemctl list-timers | grep seed-restore`
shows the next and last run; failures alert through ticket 14's ntfy channel.

### Where each recovery story lives

The Homelab Variant's is the Backups section below: a nightly dump of `meal-prep-db-1` and nothing
else. The Demo Variant's is the Seed restore above; its Postgres holds no history worth keeping and
is deliberately never dumped. Neither story is restated in the other's terms, and the Backups
section already says why.

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
([ADR-0008](../adr/0008-demo-backend-on-the-homelab.md)). A dump with an ambiguous name is a dump
somebody restores into the wrong stack later, which is why filenames carry the stack name and the
date: `homelab-variant_YYYY-MM-DD.sql`.

**What runs, and when.**

| Unit | Schedule | Does |
| --- | --- | --- |
| `meal-prep-backup.timer` → `meal-prep-backup.service` | nightly, 02:30 | Runs `ops/backup/dump.sh`: dumps the named container, refuses and alerts on a missing container, refuses and alerts on a zero-byte dump, prunes local dumps past `RETENTION_COUNT` (default 30), copies the new dump offsite, alerts and exits non-zero on any failure including a failed offsite copy. |
| `meal-prep-backup-check.timer` → `meal-prep-backup-check.service` | daily, 09:00 | Runs `ops/backup/check-backup.sh`: alerts if no dump exists for today at all, or if it exists at zero bytes. This is the watchdog for the failure dump.sh's own alerting cannot catch - the run that never happened because the host was off, the timer was disabled, or the script died before it could alert. |

Both timers set `Persistent=true`: a host that was off at its scheduled time runs the job once on
the next boot rather than waiting silently for the next day. That is also the one time these two
services race each other - both catch up around the same moment at boot, with no other ordering
between them - so `meal-prep-backup-check.service` carries `After=meal-prep-backup.service`
specifically so the catch-up check cannot read `BACKUP_DIR` while the catch-up dump is still being
written and alert "missing" on a run that is simply not finished yet. It does not require the dump
to have *succeeded*, only to have finished, so a real failure still reaches the watchdog.

**Alerting.** A push notification through [ntfy](https://ntfy.sh) - a single unauthenticated HTTP
POST, no account, no paid service. `NTFY_TOPIC` in `backup.env` is a long random string standing in
for a password: anyone who knows it can publish to it and read its history, so it is generated per
install and never committed. The Operator subscribes to that topic in the ntfy phone app (or at
`https://ntfy.sh/<topic>` in a browser) before the first real run. Required, not best-effort: both
scripts refuse to start at all if `NTFY_TOPIC` is blank, the same as `OFFSITE_DEST` below - "an
alert reaches the Operator" is a requirement this backup exists to satisfy, so a run with nowhere
to send a failure does not get to happen instead of quietly doing less than it promises. Considered
and not taken: email, which would need an MTA or a third-party relay configured on a host that has
neither today; a self-hosted ntfy instance remains open if the public one is ever a concern, and
`NTFY_URL` in `backup.env` is exactly the setting that repoints it.

**Offsite copy.** `OFFSITE_DEST` in `backup.env` is either a local path - typically a NAS share
already mounted on this host, copied with `cp` - or `user@host:path`, copied with `rsync` over
`ssh` reached over the tailnet the same way everything else here is reached, with a key rather than
a password (`BatchMode=yes` refuses to prompt for one). For the `rsync` form, `dump.sh` runs
`ssh ... mkdir -p` against the remote path before the transfer, so the first real run does not fail
against a destination directory nobody has created yet; this is `ssh mkdir -p` rather than rsync's
own `--mkpath` because that flag needs rsync 3.2.3 or newer on the offsite host and nothing here
should have to assume a version there. This is required, not best-effort: `dump.sh` fails and
alerts if `OFFSITE_DEST` is not configured, because a dump that stays local only is not what "a
copy lands off the homelab" means.

**Running as root.** Neither `.service` file sets `User=`, so both run as root - `docker exec`
needs access to the Docker socket, which on a stock Ubuntu install means root or membership in the
`docker` group, and root was the simpler choice to ship untested rather than a service account this
checkout cannot create on the Operator's behalf. Tightening it is straightforward if wanted: create
a service user, add it to the `docker` group, `chown` `BACKUP_DIR` and the offsite SSH key to it,
and add `User=`/`Group=` to both files before installing them.

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

## The spreadsheet export

Ticket 18. The spreadsheet the app came off keeps one job after cutover: being readable on a phone by
somebody with no app in front of them. This is a command you run when you feel like it, and **it is
not the backup** - the backup is the section above.

Say that part out loud once, because the mistake is only discovered on the day it matters. The
export's recovery point is the last time you approved a run. Its tabs carry no ids, no Recipe
Ingredient rows and no foreign keys, so nothing loads back out of them: restoring from this
spreadsheet is not a slow path, it is not a path. `docs/adr/0011-spreadsheet-export-is-a-convenience-copy.md`
has the whole contract.

Nothing depends on it running. No Compose service, no timer, no route. Skipping it forever changes
nothing about the deployment.

### Setting it up (once)

1. **Make a new, empty spreadsheet.** Not the Sheets-era one. That sheet's id is committed in this
   repository's history and it is shared with anyone holding the link
   ([ADR-0004](../adr/0004-accept-spreadsheet-exposure-until-cutover.md)), so exporting into it would
   republish the collection cutover just took private - and it is the extract's own source, which
   ticket 17 needs left intact. Copy the new sheet's id out of its URL:
   `https://docs.google.com/spreadsheets/d/<the id>/edit`. Share it with nobody.
2. **Make a Google service account and a key for it.** In the Google Cloud console: a project, the
   Google Sheets API enabled on it, a service account, then a JSON key on that service account. Put
   the key file somewhere outside this checkout, `chmod 600` it, and never commit it. Nothing else in
   the project is granted to it - no roles, no permissions.
3. **Share the spreadsheet with the service account's email address, as Editor.** That share is the
   entire access grant: the credential can reach that one file and nothing else in your Drive.
4. **Fill in three lines of `.env`.** `EXPORT_DATABASE_URL`, `SHEETS_SPREADSHEET_ID` and
   `SHEETS_CREDENTIALS_FILE`, all documented in `.env.example`. Use the restricted role in the
   connection string, not the owner: the export only selects. Compose reads none of the three, so
   leaving them blank is what a host that never exports looks like.

### Running it

Preview first. It shows the diff, asks nobody and writes nothing:

```
docker run --rm \
  --network meal-prep_default \
  --env-file .env \
  --volume /path/to/key.json:/key.json:ro \
  --env SHEETS_CREDENTIALS_FILE=/key.json \
  "$MEAL_PREP_IMAGE" node packages/api/src/export.js --dry-run
```

The same image with a different command, the way the migration step and the Seed restore are. Drop
`--dry-run` and add `-it` to be asked for real:

```
docker run --rm -it \
  --network meal-prep_default \
  --env-file .env \
  --volume /path/to/key.json:/key.json:ro \
  --env SHEETS_CREDENTIALS_FILE=/key.json \
  "$MEAL_PREP_IMAGE" node packages/api/src/export.js
```

`--network meal-prep_default` joins the container to the stack's own network, which is why
`EXPORT_DATABASE_URL` names the host `db:5432`: Compose publishes no Postgres port, so there is no
`127.0.0.1:5432` to reach and `--network host` fails to connect. For the same reason, running
`node packages/api/src/export.js` bare from a checkout on the host does not work against this
stack; use the `docker run` form.

Read the diff before answering. It names the tab, counts the rows that would be added, removed and
changed, and for a changed row names the column and shows both sides of it. Approving takes the whole
word `yes`; anything else declines and the spreadsheet is not touched. Without `-it` there is no
terminal to ask at, so the run declines by itself and writes nothing - that is deliberate, and it is
why an export can never happen by accident from a cron job somebody added.

The tabs are `Recipes`, `Shopping List` and `Pantry`, one row per thing. A tab that would not change
is not rewritten, and a tab the spreadsheet does not have yet is created by the write, after the
approval, never before it.

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
- **The export refuses without asking anything.** It said stdin is not a terminal. Add `-it` to the
  `docker run`, or drop `--dry-run` if that is what you passed. It declines rather than blocking, so
  nothing was written either way.
- **The export fails with a Google refusal.** The whole body is in the output, because that is where
  Google puts the reason. `403` on a spreadsheet that exists means the service account was never
  shared on it; `404` means `SHEETS_SPREADSHEET_ID` is not that sheet's id.
- **The export proposes to rewrite every row.** Something renamed the tabs or edited them by hand.
  The export owns those three tabs entirely; put anything you want to keep on a tab of your own,
  which it never touches.
