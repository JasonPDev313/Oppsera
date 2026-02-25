import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { generateActionItems } from '@oppsera/core/usage/action-item-engine';

// ── POST /api/v1/analytics/action-items/generate — Trigger insight engine ──

export const POST = withAdminPermission(
  async () => {
    const result = await generateActionItems();
    return NextResponse.json({ data: result });
  },
  { permission: 'tenants.detail.manage' },
);
