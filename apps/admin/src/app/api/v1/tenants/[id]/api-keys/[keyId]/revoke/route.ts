import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const POST = withAdminPermission(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const keyId = params?.keyId;
  if (!tenantId || !keyId) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Tenant ID and key ID required' } }, { status: 400 });
  }

  await db.execute(sql`
    UPDATE api_keys SET revoked_at = now(), is_enabled = false
    WHERE id = ${keyId} AND tenant_id = ${tenantId}
  `);

  void logAdminAudit({
    session,
    action: 'api_key.revoked',
    entityType: 'api_key',
    entityId: keyId,
    tenantId,
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ data: { success: true } });
}, { permission: 'tenants.edit' });
