import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared',
  'packages/db',
  'packages/core',
  'packages/modules/*',
  'apps/web',
  'apps/admin',
  'test/business-logic',
]);
