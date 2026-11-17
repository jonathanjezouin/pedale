import { defineConfig } from 'vite';
export default defineConfig({
  base: './',                         // chemins relatifs : indispensable pour Electron (file://)
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  server: { host: true, port: 5173 },
});
