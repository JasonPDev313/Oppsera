import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// PATCH - Toggle a feature flag
export const PATCH = withAdminPermission(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const flagKey = params?.flagKey;
  if (!tenantId || !flagKey) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Tenant ID and flag key required' } },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { is_enabled } = body;
  if (typeof is_enabled !== 'boolean') {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'is_enabled must be a boolean' } },
      { status: 400 },
    );
  }

  // Verify flag definition exists
  const defResult = await db.execute(sql`
    SELECT id, risk_level FROM feature_flag_definitions WHERE flag_key = ${flagKey}
  `);
  const defs = Array.from(defResult as Iterable<Record<string, unknown>>);
  if (defs.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Flag ${flagKey} not found` } },
      { status: 404 },
    );
  }

  const adminRef = `admin:${session.adminId}`;
  const now = new Date().toISOString();

  // Upsert tenant feature flag
  await db.execute(sql`
    INSERT INTO tenant_feature_flags (tenant_id, flag_key, is_enabled, enabled_at, enabled_by, disabled_at, disabled_by, updated_at)
    VALUES (
      ${tenantId},
      ${flagKey},
      ${is_enabled},
      ${is_enabled ? now : null},
      ${is_enabled ? adminRef : null},
      ${!is_enabled ? now : null},
      ${!is_enabled ? adminRef : null},
      ${now}
    )
    ON CONFLICT (tenant_id, flag_key) DO UPDATE SET
      is_enabled = EXCLUDED.is_enabled,
      enabled_at = CASE WHEN EXCLUDED.is_enabled THEN EXCLUDED.enabled_at ELSE tenant_feature_flags.enabled_at END,
      enabled_by = CASE WHEN EXCLUDED.is_enabled THEN EXCLUDED.enabled_by ELSE tenant_feature_flags.enabled_by END,
      disabled_at = CASE WHEN NOT EXCLUDED.is_enabled THEN EXCLUDED.disabled_at ELSE tenant_feature_flags.disabled_at END,
      disabled_by = CASE WHEN NOT EXCLUDED.is_enabled THEN EXCLUDED.disabled_by ELSE tenant_feature_flags.disabled_by END,
      updated_at = EXCLUDED.updated_at
  `);

  // Write audit log
  void logAdminAudit({
    session,
    action: is_enabled ? 'feature_flag.enabled' : 'feature_flag.disabled',
    entityType: 'feature_flag',
    entityId: flagKey,
    tenantId,
    afterSnapshot: { flagKey, is_enabled },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ data: { success: true, flagKey, isEnabled: is_enabled } });
}, { permission: 'tenants.edit' });
