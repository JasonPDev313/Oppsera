import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { resendStaffInvite } from '@/lib/staff-commands';
import { getClientIp } from '@/lib/admin-audit';

export const POST = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    try {
      await resendStaffInvite(id, session, getClientIp(req) ?? undefined);
      return NextResponse.json({ data: { ok: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Resend invite failed';
      const status = message.includes('not found') ? 404 : 409;
      return NextResponse.json({ error: { message } }, { status });
    }
  },
  { permission: 'users.staff.invite' },
);
