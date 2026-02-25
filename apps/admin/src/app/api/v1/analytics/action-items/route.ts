import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  getActionItems,
  updateActionItemStatus,
} from '@oppsera/core/usage/queries/get-action-items';

// ── GET /api/v1/analytics/action-items — List action items ──────

export const GET = withAdminPermission(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const data = await getActionItems({
      status: (params.get('status') as 'open' | 'reviewed' | 'actioned' | 'dismissed') || undefined,
      category: params.get('category') || undefined,
      severity: params.get('severity') || undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
      cursor: params.get('cursor') || undefined,
    });
    return NextResponse.json({ data });
  },
  { permission: 'tenants.detail.view' },
);

// ── PATCH /api/v1/analytics/action-items — Update item status ───

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['reviewed', 'actioned', 'dismissed']),
  reviewNotes: z.string().max(2000).optional(),
});

export const PATCH = withAdminPermission(
  async (req, session) => {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    await updateActionItemStatus(
      parsed.data.id,
      parsed.data.status,
      session.adminId,
      parsed.data.reviewNotes,
    );

    return NextResponse.json({ data: { success: true } });
  },
  { permission: 'tenants.detail.manage' },
);
