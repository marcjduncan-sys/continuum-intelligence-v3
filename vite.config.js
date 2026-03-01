import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync } from 'fs';

// IMPORTANT: Do NOT change `base`. GitHub Pages serves from /continuum-intelligence-v3/.
// Setting base to '/' causes all CSS, font, and asset paths to 404 in production.
export default defineConfig({
  base: '/continuum-intelligence-v3/',
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
