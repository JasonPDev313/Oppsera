import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { listBusinessCategories } from '@oppsera/module-business-types';

export const GET = withAdminPermission(
  async () => {
    const categories = await listBusinessCategories();
    return NextResponse.json({ data: categories });
  },
  { permission: 'system.business_types.view' },
);
