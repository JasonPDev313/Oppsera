import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { generateActionItems } from '@oppsera/core/usage/action-item-engine';

// ── POST /api/v1/analytics/action-items/generate — Trigger insight engine ──

export const POST = withAdminPermission(
  async () => {
    try {
      const result = await generateActionItems();
      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[Action Items] Generate error:', err);
      return NextResponse.json(
        { error: { code: 'GENERATE_FAILED', message: err instanceof Error ? err.message : 'Insight generation failed' } },
        { status: 500 },
      );
    }
  },
  { permission: 'tenants.detail.manage' },
);
