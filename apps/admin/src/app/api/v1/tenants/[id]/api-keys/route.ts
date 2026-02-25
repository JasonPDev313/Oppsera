import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const GET = withAdminPermission(async (
  _req: NextRequest,
  _session,
  params,
) => {
  const tenantId = params?.id;
  if (!tenantId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Tenant ID required' } },
      { status: 400 },
    );
  }

  const result = await db.execute(sql`
    SELECT
      id,
      name,
      key_prefix,
      is_enabled,
      expires_at,
      revoked_at,
      created_at,
      updated_at,
      CASE
        WHEN revoked_at IS NOT NULL THEN 'revoked'
        WHEN expires_at IS NOT NULL AND expires_at < now() THEN 'expired'
        WHEN is_enabled = false THEN 'disabled'
        ELSE 'active'
      END as status
    FROM api_keys
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  return NextResponse.json({
    data: rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      keyPrefix: r.key_prefix as string,
      isEnabled: r.is_enabled as boolean,
      expiresAt: r.expires_at as string | null,
      revokedAt: r.revoked_at as string | null,
      status: r.status as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    })),
  });
}, { permission: 'tenants.detail.view' });
