import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { listStaff } from '@/lib/staff-queries';
import { createStaff } from '@/lib/staff-commands';
import { getClientIp } from '@/lib/admin-audit';

// ── GET /api/v1/admin/staff — List staff ────────────────────────

export const GET = withAdminPermission(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const result = await listStaff({
      search: params.get('search') ?? undefined,
      status: params.get('status') ?? undefined,
      cursor: params.get('cursor') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result });
  },
  { permission: 'users.staff.view' },
);

// ── POST /api/v1/admin/staff — Create staff ─────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  password: z.string().min(8).optional(),
  roleIds: z.array(z.string()).min(1, 'At least one role is required'),
  sendInvite: z.boolean().optional(),
});

export const POST = withAdminPermission(
  async (req, session) => {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await createStaff(parsed.data, session, getClientIp(req) ?? undefined);
      return NextResponse.json({ data: result }, { status: 201 });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create staff';
      return NextResponse.json(
        { error: { code: 'CONFLICT', message } },
        { status: 409 },
      );
    }
  },
  { permission: 'users.staff.create' },
);
