import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getCustomerById } from '@/lib/customer-queries';
import { updateUser } from '@oppsera/core';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── GET /api/v1/admin/customers/:id — Customer detail ────────────

export const GET = withAdminPermission(
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

    return NextResponse.json({ data: customer });
  },
  { permission: 'users.customers.view' },
);

// ── PATCH /api/v1/admin/customers/:id — Update customer ──────────

const updateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  emailAddress: z.string().email().optional(),
  phoneNumber: z.string().max(30).optional(),
  userStatus: z.enum(['active', 'inactive', 'locked']).optional(),
});

export const PATCH = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    // Load the customer to get their tenantId
    const customer = await getCustomerById(id);
    if (!customer) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
        { status: 404 },
      );
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      // Proxy to core updateUser
      await updateUser({
        tenantId: customer.tenantId,
        updatedByUserId: session.adminId,
        userId: id,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        emailAddress: parsed.data.emailAddress,
        phoneNumber: parsed.data.phoneNumber,
        userStatus: parsed.data.userStatus,
      });

      await logAdminAudit({
        session,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: id,
        tenantId: customer.tenantId,
        beforeSnapshot: { email: customer.email, status: customer.status },
        afterSnapshot: parsed.data as unknown as Record<string, unknown>,
        ipAddress: getClientIp(req) ?? undefined,
      });

      // Re-fetch to return updated data
      const updated = await getCustomerById(id);
      return NextResponse.json({ data: updated });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update customer';
      return NextResponse.json(
        { error: { code: 'CONFLICT', message } },
        { status: 409 },
      );
    }
  },
  { permission: 'users.customers.edit' },
);
