import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { scoreAllTenants } from '@oppsera/core/usage/attrition-engine';

// ── POST /api/v1/analytics/attrition/score — Trigger scoring run ──
// Requires analytics.manage (write permission, not just view)

export const maxDuration = 120; // scoring iterates all tenants — needs headroom

export const POST = withAdminPermission(
  async () => {
    try {
      const result = await scoreAllTenants();
      return NextResponse.json({ data: result });
    } catch (err) {
      if (err instanceof Error && err.message === 'SCORING_IN_PROGRESS') {
        return NextResponse.json(
          { error: { code: 'SCORING_IN_PROGRESS', message: 'A scoring run is already in progress. Please wait.' } },
          { status: 409 },
        );
      }
      throw err; // re-throw for withAdminPermission's generic handler
    }
  },
  { permission: 'analytics.manage' },
);
