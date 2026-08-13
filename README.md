# Meal Prep App

A mobile-friendly web app for meal prepping, backed by Postgres behind a small API.

## Features
- Browse and search recipes by type
- View ingredients and link to full recipe cards
- Add recipes to a shopping list with checkoff
- "What Can I Make?" — match recipes to ingredients you have on hand
- Add new recipes with ingredients directly from the app

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
cp .env.example .env   # then fill in the two passwords
docker compose up --build
```

That brings up three services: Postgres, a migration step that runs to completion, and the API on
`http://localhost:8080`. Health is at `/api/health`. `.env` holds the only passwords and connection
strings in the project and is gitignored.

Migrations run as an owner role. The API connects as a restricted role with no ownership and no DDL
rights, created by the migration step, so a permission problem surfaces locally rather than at
deployment.

## Tests

```
npm test
```

Every test is an HTTP request against the API backed by a real Postgres — one throwaway container
per run, provisioned and torn down by the suite, no mocks. See
`docs/adr/0005-http-tests-against-real-postgres.md`. The suite needs a running Docker daemon and
fails rather than degrades without one.

## Setup for the pre-migration app

Everything below describes the app still running from **main**, which reads Google Sheets and is
what the phones use until cutover. This branch's app reads Postgres, calls its own origin, and asks
for no key at all. These steps go when Pages hosting does.

### 1. Enable GitHub Pages
GitHub Pages serves the pre-migration app from **main**, which still keeps the whole app in a
single root `index.html`. This branch has no root `index.html`; the bundle comes out of
`packages/web/dist` instead. Pages hosting goes away when the app moves to Postgres.

1. Go to your repo **Settings → Pages**
2. Under "Source", select **Deploy from a branch**
3. Select **main** branch and **/ (root)** folder
4. Click **Save**
5. Your app will be live at `https://yourusername.github.io/meal-prep-app/`

### 2. Google Sheets API Key
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project and enable the **Google Sheets API**
3. Create an **API Key** under Credentials
4. Make sure your Google Sheet sharing is set to "Anyone with the link"

### 3. Add to iPhone Home Screen
1. Open the GitHub Pages URL in Safari
2. Tap the **Share** button → **"Add to Home Screen"**
3. It launches full-screen like a native app

### 4. Sharing
Send the URL to anyone. They enter the same API key and both see the same Google Sheet data. That
sharing model is what makes the spreadsheet readable by anyone holding the link, which
`docs/adr/0004-accept-spreadsheet-exposure-until-cutover.md` accepts until cutover retires it. This
branch's app shares nothing and asks for no key: reaching it means being on the Tailscale network.
