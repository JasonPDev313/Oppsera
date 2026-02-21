import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getCustomerById } from '@/lib/customer-queries';
import { resetPassword } from '@oppsera/core';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── POST /api/v1/admin/customers/:id/reset-password ──────────────

export const POST = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const customer = await getCustomerById(id);
    if (!customer) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
        { status: 404 },
      );
    }

    try {
      await resetPassword({
        tenantId: customer.tenantId,
        userId: id,
        actorUserId: session.adminId,
      });

      await logAdminAudit({
        session,
        action: 'customer.password_reset',
        entityType: 'customer',
        entityId: id,
        tenantId: customer.tenantId,
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: { ok: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to reset password';
      return NextResponse.json(
        { error: { code: 'OPERATION_FAILED', message } },
        { status: 500 },
      );
    }
  },
  { permission: 'users.customers.reset_password' },
);
