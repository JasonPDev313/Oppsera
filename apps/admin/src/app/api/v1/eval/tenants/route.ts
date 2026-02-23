import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// Returns distinct tenantIds that have eval turns, so the admin can filter by tenant.
export const GET = withAdminAuth(async () => {
  const rows = await db.execute<{ tenant_id: string }>(
    sql`SELECT DISTINCT tenant_id FROM semantic_eval_turns ORDER BY tenant_id LIMIT 500`,
  );

  const tenants = Array.from(rows as Iterable<{ tenant_id: string }>).map((r) => ({
    id: r.tenant_id,
    name: r.tenant_id, // Name resolution requires a join to tenants table (V2)
  }));

  return NextResponse.json({ data: tenants });
});
