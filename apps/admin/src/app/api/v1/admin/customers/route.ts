import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { listCustomers } from '@/lib/customer-queries';

// ── GET /api/v1/admin/customers — List customers (cross-tenant) ──

export const GET = withAdminPermission(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const result = await listCustomers({
      tenantId: params.get('tenantId') ?? undefined,
      search: params.get('search') ?? undefined,
      status: params.get('status') ?? undefined,
      cursor: params.get('cursor') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result });
  },
  { permission: 'users.customers.view' },
);
