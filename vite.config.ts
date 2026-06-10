import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// The Nexmarket Backoffice is a Vite + React 19 SPA that doubles as an
// installable PWA (see public/manifest.webmanifest + public/sw.js). It mirrors
// the loja app's stack so the whole platform stays on one toolchain.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
