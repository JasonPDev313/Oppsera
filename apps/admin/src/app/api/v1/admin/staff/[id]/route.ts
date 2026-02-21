import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getStaffById } from '@/lib/staff-queries';
import { updateStaff } from '@/lib/staff-commands';
import { getClientIp } from '@/lib/admin-audit';

// ── GET /api/v1/admin/staff/:id — Staff detail ─────────────────

export const GET = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const staff = await getStaffById(id);
    if (!staff) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Staff member not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: staff });
  },
  { permission: 'users.staff.view' },
);

// ── PATCH /api/v1/admin/staff/:id — Update staff ───────────────

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  roleIds: z.array(z.string()).optional(),
});

export const PATCH = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await updateStaff(id, parsed.data, session, getClientIp(req) ?? undefined);
      return NextResponse.json({ data: result });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update staff';
      const status = message.includes('not found') ? 404 : 409;
      return NextResponse.json({ error: { message } }, { status });
    }
  },
  { permission: 'users.staff.edit' },
);
