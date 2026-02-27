import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const POST = withAdminPermission(async (req: NextRequest, session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const reason = (body.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: { message: 'Reason is required to suspend a tenant' } }, { status: 400 });
  }

  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, id));
  if (!tenant) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  if (tenant.status === 'suspended') {
    return NextResponse.json({ error: { message: 'Tenant is already suspended' } }, { status: 409 });
  }

  // Set base columns, then try Phase 1A columns (best-effort)
  const [updated] = await db
    .update(tenants)
    .set({ status: 'suspended', updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning({ id: tenants.id, status: tenants.status });

  try {
    await db.update(tenants)
      .set({ suspendedAt: new Date(), suspendedReason: reason })
      .where(eq(tenants.id, id));
  } catch {
    // Phase 1A columns don't exist yet — skip
  }

  void logAdminAudit({
    session,
    action: 'tenant.suspended',
    entityType: 'tenant',
    entityId: id,
    tenantId: id,
    beforeSnapshot: { status: tenant.status },
    afterSnapshot: { status: 'suspended', suspendedReason: reason },
    reason,
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ data: { id: updated!.id, status: updated!.status } });
}, { permission: 'tenants.write' });
