/**
 * GET /api/v1/import/staff/context
 *
 * Returns the tenant's roles and locations for the value mapping step.
 * The frontend uses this to build the role/location mapping UI.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';

async function handler(_req: NextRequest, ctx: RequestContext) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    const rolesResult = await tx.execute(
      sql`SELECT id, name, description, is_system
          FROM roles
          WHERE tenant_id = ${ctx.tenantId}
          ORDER BY is_system DESC, name ASC`
    );
    const roles = Array.from(rolesResult as Iterable<{
      id: string;
      name: string;
      description: string | null;
      is_system: boolean;
    }>);

    const locationsResult = await tx.execute(
      sql`SELECT id, name, location_type, parent_location_id, is_active
          FROM locations
          WHERE tenant_id = ${ctx.tenantId} AND is_active = true
          ORDER BY location_type ASC, name ASC`
    );
    const locations = Array.from(locationsResult as Iterable<{
      id: string;
      name: string;
      location_type: string;
      parent_location_id: string | null;
      is_active: boolean;
    }>);

    return { roles, locations };
  });

  return NextResponse.json({ data: result });
}

export const GET = withMiddleware(handler, {
  entitlement: 'platform_core',
  permission: 'users.manage',
});
