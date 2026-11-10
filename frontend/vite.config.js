import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend target is configurable so dev can point at any running API port
// (defaults to 8080, matching the Docker/production setup). In the Docker image
// the build output is served by Express at the same origin, so no proxy is used.
const backend = process.env.BACKEND_URL || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/graphql': backend,
      '/health': backend,
      '/ready': backend,
    },
  },
  build: { outDir: 'dist' },
});
