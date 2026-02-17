import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@oppsera/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
