import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@oppsera/shared': path.resolve(__dirname, '../shared/src'),
      '@oppsera/db': path.resolve(__dirname, '../db/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10_000,
  },
});
