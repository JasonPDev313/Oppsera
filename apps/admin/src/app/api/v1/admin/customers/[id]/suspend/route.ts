import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getCustomerById } from '@/lib/customer-queries';
import { updateUser } from '@oppsera/core';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── POST /api/v1/admin/customers/:id/suspend ─────────────────────

const schema = z.object({
  action: z.enum(['suspend', 'unsuspend']),
  reason: z.string().max(500).optional(),
});

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

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const newStatus = parsed.data.action === 'suspend' ? 'locked' as const : 'active' as const;

    try {
      await updateUser({
        tenantId: customer.tenantId,
        updatedByUserId: session.adminId,
        userId: id,
        userStatus: newStatus,
      });

      await logAdminAudit({
        session,
        action: parsed.data.action === 'suspend' ? 'customer.suspended' : 'customer.unsuspended',
        entityType: 'customer',
        entityId: id,
        tenantId: customer.tenantId,
        reason: parsed.data.reason,
        beforeSnapshot: { status: customer.status },
        afterSnapshot: { status: newStatus },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: { ok: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update customer status';
      return NextResponse.json(
        { error: { code: 'OPERATION_FAILED', message } },
        { status: 500 },
      );
    }
  },
  { permission: 'users.customers.suspend' },
);
