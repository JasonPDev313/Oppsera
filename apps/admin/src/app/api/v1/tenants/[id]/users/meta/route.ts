import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';

/** Returns roles + locations for a tenant (used by user add/edit forms) */
export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const [roleRows, locationRows] = await Promise.all([
    db.execute(sql`
      SELECT id, name FROM roles WHERE tenant_id = ${tenantId} ORDER BY name ASC
    `),
    db.execute(sql`
      SELECT id, name FROM locations WHERE tenant_id = ${tenantId} AND is_active = true ORDER BY name ASC
    `),
  ]);

  return NextResponse.json({
    data: {
      roles: Array.from(roleRows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        name: r.name as string,
      })),
      locations: Array.from(locationRows as Iterable<Record<string, unknown>>).map((l) => ({
        id: l.id as string,
        name: l.name as string,
      })),
    },
  });
});
