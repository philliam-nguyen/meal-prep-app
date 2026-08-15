# Meal Prep App

A mobile-friendly web app for meal prepping, backed by Postgres behind a small API.

## Features
- Browse and search recipes by type
- View ingredients and link to full recipe cards
- Add recipes to a shopping list with checkoff
- "What Can I Make?" — match recipes to ingredients you have on hand
- Add new recipes with ingredients directly from the app
- Edit and delete recipes from the app, so a typo does not need a database session

## Development

Requires Node 24 or newer, because the test command uses the test runner's global-setup hook.
Running the tests also needs a Docker daemon.

```
npm install
npm run dev      # dev server with hot reload
npm run build    # static bundle into packages/web/dist
npm run preview  # serve the built bundle
```

`packages/web/dist` is build output and is not committed, so build it after cloning.

`npm run dev` proxies `/api` to `http://localhost:8080`, so bring the local stack up alongside it or
the app loads with no recipes. Nothing else in the frontend knows an origin.

The repository is an npm workspace:

| Package | Contents |
| --- | --- |
| `packages/web` | the frontend: React, compiled ahead of time, no CDN at runtime |
| `packages/api` | the API: Fastify, Postgres, and the migrations |
| `packages/shared` | domain constants and validation the frontend and the API both import |

## Local stack

Postgres and the API, with the API serving the frontend bundle from its own origin so the frontend
calls relative paths and needs no configuration of its own.

```
cp .env.example .env   # fill in the two passwords and check CORS_ORIGIN
docker compose -f compose.yaml -f compose.build.yaml up --build
```

That brings up three services: Postgres, a migration step that runs to completion, and the API on
`http://localhost:8080`. Health is at `/api/health`. `.env` holds the only passwords and connection
strings in the project and is gitignored.

`compose.yaml` on its own builds nothing: it runs the image `MEAL_PREP_IMAGE` names, because both
Variants run one published image (`docs/adr/0002-variant-seam-in-infrastructure.md`). The build
override adds the build for a machine that has the source, and tags it with that same name, so
building and pulling produce one artifact rather than two. The API is published to `127.0.0.1`
only, whatever `API_PORT` says.

Migrations run as an owner role. The API connects as a restricted role with no ownership and no DDL
rights, created by the migration step, so a permission problem surfaces locally rather than at
deployment.

## Guardrails

The API rate-limits writes per client address, caps the request body, answers one configured origin,
and refuses a Recipe once the instance holds the number it is configured for. See
`docs/adr/0001-app-level-demo-guardrails.md` for what these defend against and what was left out.

None of it checks which Variant is running. The same code enforces the same guardrails everywhere,
and a tighter public instance is a different `.env` rather than a different build. The values, their
defaults and why each number was picked are in `.env.example` and `packages/api/src/config.js`.

Two of them will bite you if you get them wrong:

- `CORS_ORIGIN` has no default and must match how the browser reaches the app, port included.
  Browsers attach an `Origin` to same-origin writes too, so a wrong value refuses the app's own
  saves rather than only refusing other sites.
- `TRUST_PROXY` decides whether the client address comes from `X-Forwarded-For`. Turn it on only
  when something you control terminates in front of the API. Off behind a CDN buckets every visitor
  together; on when nothing sets the header lets a caller claim any address.

## Tests

```
npm test
```

The API's tests are HTTP requests against it backed by a real Postgres, one throwaway container per
run, provisioned and torn down by the suite, no mocks. That seam and everything standing outside it
are in `docs/adr/0005-http-tests-against-real-postgres.md`: unit suites in `packages/shared` and
`packages/web`, and the assertions on `compose.yaml` at the repository root. The suite needs a
running Docker daemon and fails rather than degrades without one.

## Access

There is no setup screen, no API key to paste and nothing to share by link. The frontend calls the
API on its own origin, and reaching the homelab instance means being on the Tailscale network:
network membership is the whole authorization model, which is what
`docs/adr/0003-no-application-auth.md` decided and why. `docs/runbooks/homelab.md` covers deploying
that instance, including the checks that prove it answers on the tailnet and nowhere else.

Anyone who can reach an instance can change what is in it. That is the intended model for a
household of two on a private network, and the reason the public Demo Variant is populated only
with Seed data and marks its seeded rows Protected.

### Add to iPhone Home Screen
1. Open the app's URL in Safari
2. Tap the **Share** button → **"Add to Home Screen"**
3. It launches full-screen like a native app
