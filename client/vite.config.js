import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev server proxies /api to the Express server on :4000, so the browser talks
// to one origin and no API base URL is needed in development.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
