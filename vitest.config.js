import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    exclude: ['tests/**', 'node_modules/**', 'dist/**', 'scripts/**'],
    environment: 'node',
    globals: true,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js', 'src/data/dynamics.js', 'src/pages/report-sections.js'],
      exclude: ['src/**/*.test.js'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage/vitest',
    },
  },
});
