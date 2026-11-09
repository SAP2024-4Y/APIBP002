import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev (vite on :5173) proxy API + GraphQL to the backend on :8080.
// In the Docker image the build output is served by Express at the same origin,
// so these relative paths need no proxy there.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/graphql': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
  },
});
