import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./setup.ts'],
    include: ['**/*.test.ts'],
    // Run integration tests sequentially — they share a database
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  resolve: {
    alias: {
      '@oppsera/db': path.resolve(__dirname, '../../packages/db/src'),
      '@oppsera/core': path.resolve(__dirname, '../../packages/core/src'),
      '@oppsera/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@oppsera/module-orders': path.resolve(__dirname, '../../packages/modules/orders/src'),
      '@oppsera/module-payments': path.resolve(__dirname, '../../packages/modules/payments/src'),
      '@oppsera/module-inventory': path.resolve(__dirname, '../../packages/modules/inventory/src'),
      '@oppsera/module-catalog': path.resolve(__dirname, '../../packages/modules/catalog/src'),
      '@oppsera/module-customers': path.resolve(__dirname, '../../packages/modules/customers/src'),
    },
  },
});
