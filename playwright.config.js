// The browser suite: Playwright driving the real frontend against the real API on a throwaway
// Postgres. Two projects, one test directory. A green run here means the whole stack worked in a
// browser, which is the one thing neither the API suite nor the frontend unit suites can say.
//
// Separate from `npm test` on purpose. The Node runner's global setup boots a Postgres for
// in-process requests; this boots its own stack for a browser, and the two never share a database,
// a port or a process, so neither can break the other.

import { defineConfig, devices } from '@playwright/test';

// Neither is the port a deployment or a plain `npm run dev` uses (8080 and 5173), so a stack a
// developer has running does not collide with a browser run, and a stale one cannot be mistaken
// for the throwaway one: Playwright refuses to start when the port is already taken.
const API_PORT = 8091;
const WEB_PORT = 5191;

/** Where the throwaway API answers. Tests seed their data here, directly, over HTTP. */
export const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
/** Where the browser is pointed: Vite, proxying /api to the origin above. */
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: 'test/browser',
  // `.spec.js` rather than `.test.js`, which is the glob the Node runner at the root picks up.
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries anywhere. A gesture test that passes on the second try is a gesture that failed
  // once, and the trace of that failure is what the report is for.
  retries: 0,
  reporter: [['list'], ['html', { open: process.env.CI ? 'never' : 'on-failure' }]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
  },
  // Which project a test runs on is a fact about the file's name, declared here, rather than a
  // skip inside the test: `*.desktop.spec.js` runs on Desktop only, `*.mobile.spec.js` on Mobile
  // only, and a bare `*.spec.js` on both.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.mobile.spec.js',
    },
    {
      // WebKit rather than Chromium because the Homelab Variant is used from iPhones, and touch
      // and scroll edge cases differ between engines. Playwright's Linux WebKit is not Safari, but
      // it is the closest thing a CI runner can launch.
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testIgnore: '**/*.desktop.spec.js',
    },
  ],
  // Playwright's own orchestration, in order: the API first, because Vite proxies to it. Both are
  // started fresh every run and torn down with the run; a server already on either port is an
  // error rather than something to reuse, since a reused API is a database with yesterday's rows.
  webServer: [
    {
      command: 'npm run throwaway --workspace @meal-prep/api',
      url: `${API_ORIGIN}/api/health`,
      env: { PORT: String(API_PORT), CORS_ORIGIN: WEB_ORIGIN },
      // Long enough for a Docker image pull on a clean machine.
      timeout: 180_000,
      // SIGTERM rather than the default SIGKILL, so the throwaway container is stopped by the
      // process that started it rather than left for Testcontainers' reaper to find.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm run dev --workspace @meal-prep/web -- --port ${WEB_PORT} --strictPort`,
      url: WEB_ORIGIN,
      env: { API_ORIGIN },
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
