import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getCustomerById } from '@/lib/customer-queries';
import { inviteUser } from '@oppsera/core';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── POST /api/v1/admin/customers/:id/resend-invite ───────────────

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

    if (customer.status !== 'invited') {
      return NextResponse.json(
        { error: { code: 'INVALID_STATUS', message: 'Can only resend invites for users with status "invited"' } },
        { status: 400 },
      );
    }

    const primaryRoleId = customer.roles[0]?.id;
    if (!primaryRoleId) {
      return NextResponse.json(
        { error: { code: 'NO_ROLE', message: 'Customer has no assigned role — cannot resend invite' } },
        { status: 400 },
      );
    }

    try {
      await inviteUser({
        tenantId: customer.tenantId,
        invitedByUserId: session.adminId,
        emailAddress: customer.email,
        roleId: primaryRoleId,
      });

      await logAdminAudit({
        session,
        action: 'customer.invite_resent',
        entityType: 'customer',
        entityId: id,
        tenantId: customer.tenantId,
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: { ok: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to resend invite';
      return NextResponse.json(
        { error: { code: 'OPERATION_FAILED', message } },
        { status: 500 },
      );
    }
  },
  { permission: 'users.customers.invite' },
);
