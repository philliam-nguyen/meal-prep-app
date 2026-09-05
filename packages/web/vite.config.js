import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In a deployment the API serves this bundle from its own origin, so /api is already same-origin
// and the frontend needs no configuration (ADR-0002). The dev server is the one place that is not
// true, because Vite serves the bundle and the API runs its own process, so proxy /api across to
// keep the relative paths in the code identical to the ones that ship.
//
// The browser suite runs this same dev server against a throwaway API on a port of its own, so the
// target is overridable from the environment. Read here, in the config, rather than through a
// VITE_-prefixed variable: those are inlined into the bundle, and nothing shipped may carry an
// origin (ADR-0002).
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_ORIGIN, changeOrigin: true },
    },
  },
});
