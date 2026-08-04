# Meal Prep App

A mobile-friendly web app for meal prepping, powered by Google Sheets.

## Features
- Browse and search recipes by type
- View ingredients and link to full recipe cards
- Add recipes to a shopping list with checkoff
- "What Can I Make?" — match recipes to ingredients you have on hand
- Add new recipes with ingredients directly from the app

## Development

Requires Node 20 or newer.

```
npm install
npm run dev      # dev server with hot reload
npm run build    # static bundle into packages/web/dist
npm run preview  # serve the built bundle
```

`packages/web/dist` is build output and is not committed, so build it after cloning.

The repository is an npm workspace:

| Package | Contents |
| --- | --- |
| `packages/web` | the frontend: React, compiled ahead of time, no CDN at runtime |
| `packages/shared` | domain constants and validation the frontend and the API both import |

## Setup

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

## Sharing
Send the URL to anyone — they enter the same API key and both see the same Google Sheet data.
