import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // Use jsdom for component/a11y tests — default node for unit tests
    environmentMatchGlobs: [
      ['src/**/*.a11y.test.tsx', 'jsdom'],
      ['src/**/*.component.test.tsx', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/types/**',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@oppsera/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
