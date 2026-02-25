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

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
  if (!tenant) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  if (tenant.status !== 'suspended') {
    return NextResponse.json({ error: { message: 'Tenant is not suspended' } }, { status: 409 });
  }

  const [updated] = await db
    .update(tenants)
    .set({
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, id))
    .returning();

  void logAdminAudit({
    session,
    action: 'tenant.reactivated',
    entityType: 'tenant',
    entityId: id,
    tenantId: id,
    beforeSnapshot: { status: 'suspended', suspendedReason: tenant.suspendedReason },
    afterSnapshot: { status: 'active' },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ data: { id: updated!.id, status: updated!.status } });
}, { permission: 'tenants.write' });
