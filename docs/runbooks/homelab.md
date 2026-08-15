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
deletes it, and there is no host directory to recover it from. Scheduled dumps are a separate job
and this stack does not perform them.

## When something is wrong

- **The API container restarts in a loop.** `docker compose logs api`. A missing or unparseable
  guardrail value fails at startup by design.
- **The API never starts.** `docker compose logs migrate`. The migration step logs the whole error
  because it runs unattended and its log is the only account of what happened.
- **Saves fail from the phone but reads work.** `CORS_ORIGIN` does not match the URL in the address
  bar. Scheme, host, and port all count.
- **`tailscale serve` answers with 502.** The API is not up on port 8080. Check `docker compose ps`
  and the health endpoint on the host first.
