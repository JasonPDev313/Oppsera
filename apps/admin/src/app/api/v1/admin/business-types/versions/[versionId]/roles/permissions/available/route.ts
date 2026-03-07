import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { MODULE_ENTRIES, VALID_PERMISSION_KEYS } from '@oppsera/module-business-types';

export const GET = withAdminPermission(
  async () => {
    // Group permissions by module for the UI permission picker
    const groups: Record<string, string[]> = {};

    for (const key of VALID_PERMISSION_KEYS) {
      const parts = key.split('.');
      const moduleKey = parts[0];
      if (!moduleKey) continue;
      if (!groups[moduleKey]) groups[moduleKey] = [];
      groups[moduleKey].push(key);
    }

    // Enrich with module labels
    const result = Object.entries(groups).map(([moduleKey, permissions]) => {
      const entry = MODULE_ENTRIES.find((m) => m.key === moduleKey);
      return {
        moduleKey,
        moduleLabel: entry?.label ?? moduleKey,
        permissions: permissions.sort(),
      };
    });

    return NextResponse.json({ data: result });
  },
  { permission: 'system.business_types.view' },
);
