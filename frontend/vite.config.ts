import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    // In dev, /api is proxied to the Fastify server so VITE_API_URL can stay empty.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  preview: { port: 4173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
      },
    },
  },
});
