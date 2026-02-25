import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// GET - List feature flags for a tenant (all definitions + tenant overrides)
export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Tenant ID required' } },
      { status: 400 },
    );
  }

  // Join definitions with tenant flags
  const result = await db.execute(sql`
    SELECT
      d.id as definition_id,
      d.flag_key,
      d.display_name,
      d.description,
      d.module_key,
      d.risk_level,
      d.is_active,
      COALESCE(tf.is_enabled, false) as is_enabled,
      tf.enabled_at,
      tf.enabled_by,
      tf.disabled_at,
      tf.disabled_by
    FROM feature_flag_definitions d
    LEFT JOIN tenant_feature_flags tf ON tf.flag_key = d.flag_key AND tf.tenant_id = ${tenantId}
    WHERE d.is_active = true
    ORDER BY d.module_key, d.display_name
  `);

  const flags = Array.from(result as Iterable<Record<string, unknown>>).map(r => ({
    definitionId: r.definition_id as string,
    flagKey: r.flag_key as string,
    displayName: r.display_name as string,
    description: r.description as string | null,
    moduleKey: r.module_key as string | null,
    riskLevel: r.risk_level as string,
    isEnabled: r.is_enabled as boolean,
    enabledAt: r.enabled_at as string | null,
    enabledBy: r.enabled_by as string | null,
    disabledAt: r.disabled_at as string | null,
    disabledBy: r.disabled_by as string | null,
  }));

  return NextResponse.json({ data: flags });
}, { permission: 'tenants.view' });
