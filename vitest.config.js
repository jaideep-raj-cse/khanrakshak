// Browser-level (jsdom) tests only. The Node-only suites (npm test) don't use this file.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.jsx'],
    testTimeout: 30000,
  },
});
