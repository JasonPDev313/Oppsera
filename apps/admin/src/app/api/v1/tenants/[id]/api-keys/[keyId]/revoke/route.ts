import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const POST = withAdminPermission(async (
  _req: NextRequest,
  _session,
  params,
) => {
  const tenantId = params?.id;
  const keyId = params?.keyId;
  if (!tenantId || !keyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Tenant ID and key ID required' } },
      { status: 400 },
    );
  }

  const result = await db.execute(sql`
    UPDATE api_keys
    SET revoked_at = now(), is_enabled = false, updated_at = now()
    WHERE id = ${keyId} AND tenant_id = ${tenantId} AND revoked_at IS NULL
    RETURNING id
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'API key not found or already revoked' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: { success: true } });
}, { permission: 'tenants.detail.manage' });
