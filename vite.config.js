import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync } from 'fs';

export default defineConfig({
  base: '/',
  root: '.',
  publicDir: 'public',
  plugins: [{
    name: 'copy-data',
    closeBundle() {
      cpSync('data', 'dist/data', { recursive: true });
    }
  }],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    },
    copyPublicDir: true
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
