import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { roles, rolePermissions } from '@oppsera/db';

const SYSTEM_ROLES = [
  { name: 'Super Admin', description: 'All permissions across all modules — auto-includes new permissions', permissions: ['*'] },
  { name: 'Owner', description: 'Full access to all features', permissions: ['*'] },
  { name: 'Manager', description: 'Full operational control across all modules', permissions: ['catalog.*', 'orders.*', 'inventory.*', 'customers.*', 'tenders.*', 'reports.view', 'settings.view', 'price.override', 'charges.manage', 'cash.drawer', 'shift.manage', 'discounts.apply', 'returns.create'] },
  { name: 'Supervisor', description: 'Manage orders and POS operations, view catalog and inventory', permissions: ['catalog.view', 'orders.*', 'inventory.view', 'customers.view', 'tenders.create', 'tenders.view', 'reports.view', 'price.override', 'charges.manage', 'cash.drawer', 'shift.manage', 'discounts.apply', 'returns.create'] },
  { name: 'Cashier', description: 'Ring up sales, process payments, manage cash drawer', permissions: ['catalog.view', 'orders.create', 'orders.view', 'tenders.create', 'tenders.view', 'customers.view', 'customers.create', 'discounts.apply', 'cash.drawer', 'shift.manage'] },
  { name: 'Server', description: 'F&B order entry, process payments, manage tables', permissions: ['catalog.view', 'orders.create', 'orders.view', 'tenders.create', 'tenders.view', 'customers.view', 'discounts.apply', 'cash.drawer', 'shift.manage'] },
  { name: 'Staff', description: 'View catalog and orders', permissions: ['catalog.view', 'orders.view'] },
] as const;

/** Returns roles + locations for a tenant (used by user add/edit forms) */
export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  let [roleRows, locationRows] = await Promise.all([
    db.execute(sql`
      SELECT id, name FROM roles WHERE tenant_id = ${tenantId} ORDER BY name ASC
    `),
    db.execute(sql`
      SELECT id, name FROM locations WHERE tenant_id = ${tenantId} AND is_active = true ORDER BY name ASC
    `),
  ]);

  // Auto-seed system roles if none exist (handles tenants created before role provisioning was added)
  const roleList = Array.from(roleRows as Iterable<Record<string, unknown>>);
  if (roleList.length === 0) {
    await db.transaction(async (tx) => {
      for (const roleDef of SYSTEM_ROLES) {
        const roleId = generateUlid();
        await tx.insert(roles).values({
          id: roleId,
          tenantId,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
        });
        for (const permission of roleDef.permissions) {
          await tx.insert(rolePermissions).values({
            id: generateUlid(),
            roleId,
            permission,
          });
        }
      }
    });
    // Re-fetch after seeding
    roleRows = await db.execute(sql`
      SELECT id, name FROM roles WHERE tenant_id = ${tenantId} ORDER BY name ASC
    `);
  }

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
