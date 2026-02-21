import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { deleteStaff } from '@/lib/staff-commands';
import { getClientIp } from '@/lib/admin-audit';

const deleteSchema = z.object({
  confirmationText: z.string(),
  reason: z.string().min(1).max(500),
});

export const DELETE = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    if (parsed.data.confirmationText !== 'DELETE') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Confirmation text must be "DELETE"' } },
        { status: 400 },
      );
    }

    try {
      await deleteStaff(id, parsed.data.reason, session, getClientIp(req) ?? undefined);
      return NextResponse.json({ data: { ok: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Delete failed';
      const status = message.includes('Only Super Admin') ? 403
        : message.includes('not found') ? 404 : 409;
      return NextResponse.json({ error: { message } }, { status });
    }
  },
  { minRole: 'super_admin', permission: 'users.staff.delete' },
);
