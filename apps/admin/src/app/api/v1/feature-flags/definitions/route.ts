import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// GET - List all feature flag definitions
export const GET = withAdminPermission(async (_req: NextRequest) => {
  const result = await db.execute(sql`
    SELECT id, flag_key, display_name, description, module_key, risk_level, is_active, created_at
    FROM feature_flag_definitions
    ORDER BY module_key, display_name
  `);

  const definitions = Array.from(result as Iterable<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    flagKey: r.flag_key as string,
    displayName: r.display_name as string,
    description: r.description as string | null,
    moduleKey: r.module_key as string | null,
    riskLevel: r.risk_level as string,
    isActive: r.is_active as boolean,
    createdAt: r.created_at as string,
  }));

  return NextResponse.json({ data: definitions });
}, { permission: 'tenants.view' });
