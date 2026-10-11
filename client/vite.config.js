import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, Vite forwards /api and /socket.io requests to the Express
// server on port 5000. The browser thinks everything is on one origin, so the
// login cookie just works and we don't need CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
