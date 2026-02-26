import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    },
    // Copy static directories that the app references at runtime
    copyPublicDir: true
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://imaginative-vision-production-16cb.up.railway.app',
        changeOrigin: true,
        secure: true
      }
    }
  }
});
