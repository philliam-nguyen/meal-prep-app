import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In a deployment the API serves this bundle from its own origin, so /api is already same-origin
// and the frontend needs no configuration (ADR-0002). The dev server is the one place that is not
// true, because Vite serves the bundle and the API runs its own process, so proxy /api across to
// keep the relative paths in the code identical to the ones that ship.
const API_ORIGIN = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_ORIGIN, changeOrigin: true },
    },
  },
});
