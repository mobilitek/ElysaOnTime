import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    // En développement, Vite transmet les appels API à Elysia pour conserver
    // des URL relatives identiques à celles utilisées en production.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    // Elysia sert ce répertoire statique dans l'image Docker finale.
    outDir: '../dist/web',
    emptyOutDir: true,
  },
});
