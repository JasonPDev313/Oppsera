import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { suspendStaff, unsuspendStaff } from '@/lib/staff-commands';
import { getClientIp } from '@/lib/admin-audit';

const suspendSchema = z.object({
  action: z.enum(['suspend', 'unsuspend']),
  reason: z.string().min(1).max(500).optional(),
});

export const POST = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const body = await req.json();
    const parsed = suspendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const ip = getClientIp(req) ?? undefined;
      if (parsed.data.action === 'suspend') {
        await suspendStaff(id, parsed.data.reason ?? '', session, ip);
      } else {
        await unsuspendStaff(id, session, ip);
      }
      return NextResponse.json({ data: { ok: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Operation failed';
      const status = message.includes('not found') ? 404 : 409;
      return NextResponse.json({ error: { message } }, { status });
    }
  },
  { permission: 'users.staff.suspend' },
);
