import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/search — Global unified search across 6 entity types ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get('q') ?? '').trim();
    const typesParam = sp.get('types') ?? undefined;
    const tenantIdScope = sp.get('tenant_id') ?? undefined;
    const limit = Math.min(20, Math.max(1, Number(sp.get('limit') ?? '5')));

    if (q.length < 2) {
      return NextResponse.json({
        data: { tenants: [], users: [], customers: [], orders: [], locations: [], terminals: [], totalResults: 0, query: q, searchTimeMs: 0 },
      });
    }

    const searchTypes = typesParam ? typesParam.split(',') : ['tenant', 'user', 'customer', 'order', 'location', 'terminal'];
    const likePattern = `%${q}%`;
    const prefixPattern = `${q}%`;

    const start = Date.now();

    const result = await withAdminDb(async (tx) => {
      const promises: Promise<unknown[]>[] = [];
      const typeOrder: string[] = [];

      // Tenants (only if not scoped to a specific tenant)
      if (searchTypes.includes('tenant') && !tenantIdScope) {
        typeOrder.push('tenants');
        promises.push(
          tx.execute(sql`
            SELECT id, name, slug, industry, status,
              CASE
                WHEN name ILIKE ${likePattern} THEN 'name'
                WHEN slug ILIKE ${likePattern} THEN 'slug'
                WHEN primary_contact_email ILIKE ${likePattern} THEN 'contact_email'
                ELSE 'name'
              END AS match_field
            FROM tenants
            WHERE (name ILIKE ${likePattern} OR slug ILIKE ${likePattern} OR primary_contact_email ILIKE ${likePattern})
            ORDER BY CASE WHEN name ILIKE ${prefixPattern} THEN 0 ELSE 1 END, name
            LIMIT ${limit}
          `).then((r) => Array.from(r as Iterable<Record<string, unknown>>)),
        );
      } else {
        typeOrder.push('tenants');
        promises.push(Promise.resolve([]));
      }

      // Users
      if (searchTypes.includes('user')) {
        typeOrder.push('users');
        const tenantFilter = tenantIdScope ? sql`AND u.tenant_id = ${tenantIdScope}` : sql``;
        promises.push(
          tx.execute(sql`
            SELECT u.id, u.display_name AS name, u.email, u.tenant_id, t.name AS tenant_name, u.status,
              CASE
                WHEN u.email ILIKE ${likePattern} THEN 'email'
                WHEN u.display_name ILIKE ${likePattern} THEN 'name'
                ELSE 'name'
              END AS match_field
            FROM users u
            JOIN tenants t ON u.tenant_id = t.id
            WHERE (u.email ILIKE ${likePattern} OR u.display_name ILIKE ${likePattern})
            ${tenantFilter}
            ORDER BY CASE WHEN u.email ILIKE ${prefixPattern} THEN 0 ELSE 1 END, u.display_name
            LIMIT ${limit}
          `).then((r) => Array.from(r as Iterable<Record<string, unknown>>)),
        );
      } else {
        typeOrder.push('users');
        promises.push(Promise.resolve([]));
      }

      // Customers
      if (searchTypes.includes('customer')) {
        typeOrder.push('customers');
        const tenantFilter = tenantIdScope ? sql`AND c.tenant_id = ${tenantIdScope}` : sql``;
        promises.push(
          tx.execute(sql`
            SELECT c.id, c.display_name, c.email, c.tenant_id, t.name AS tenant_name,
              CASE
                WHEN c.email ILIKE ${likePattern} THEN 'email'
                WHEN c.display_name ILIKE ${likePattern} THEN 'name'
                WHEN c.phone ILIKE ${likePattern} THEN 'phone'
                ELSE 'name'
              END AS match_field
            FROM customers c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE (c.email ILIKE ${likePattern} OR c.display_name ILIKE ${likePattern} OR c.phone ILIKE ${likePattern})
            ${tenantFilter}
            LIMIT ${limit}
          `).then((r) => Array.from(r as Iterable<Record<string, unknown>>)),
        );
      } else {
        typeOrder.push('customers');
        promises.push(Promise.resolve([]));
      }

      // Orders
      if (searchTypes.includes('order')) {
        typeOrder.push('orders');
        const tenantFilter = tenantIdScope ? sql`AND o.tenant_id = ${tenantIdScope}` : sql``;
        promises.push(
          tx.execute(sql`
            SELECT o.id, o.order_number, o.tenant_id, t.name AS tenant_name,
                   o.total, o.status, o.business_date,
              CASE
                WHEN o.order_number::text ILIKE ${likePattern} THEN 'order_number'
                ELSE 'order_number'
              END AS match_field
            FROM orders o
            JOIN tenants t ON o.tenant_id = t.id
            WHERE o.order_number::text ILIKE ${likePattern}
            ${tenantFilter}
            ORDER BY o.created_at DESC
            LIMIT ${limit}
          `).then((r) => Array.from(r as Iterable<Record<string, unknown>>)),
        );
      } else {
        typeOrder.push('orders');
        promises.push(Promise.resolve([]));
      }

      // Locations
      if (searchTypes.includes('location')) {
        typeOrder.push('locations');
        const tenantFilter = tenantIdScope ? sql`AND l.tenant_id = ${tenantIdScope}` : sql``;
        promises.push(
          tx.execute(sql`
            SELECT l.id, l.name, l.tenant_id, t.name AS tenant_name, l.location_type, l.is_active,
              'name' AS match_field
            FROM locations l
            JOIN tenants t ON l.tenant_id = t.id
            WHERE l.name ILIKE ${likePattern}
            ${tenantFilter}
            LIMIT ${limit}
          `).then((r) => Array.from(r as Iterable<Record<string, unknown>>)),
        );
      } else {
        typeOrder.push('locations');
        promises.push(Promise.resolve([]));
      }

      // Terminals
      if (searchTypes.includes('terminal')) {
        typeOrder.push('terminals');
        const tenantFilter = tenantIdScope ? sql`AND tm.tenant_id = ${tenantIdScope}` : sql``;
        promises.push(
          tx.execute(sql`
            SELECT tm.id, tm.name, tm.tenant_id, t.name AS tenant_name,
                   l.name AS location_name, tm.status,
              'name' AS match_field
            FROM terminals tm
            JOIN tenants t ON tm.tenant_id = t.id
            LEFT JOIN locations l ON tm.location_id = l.id
            WHERE tm.name ILIKE ${likePattern}
            ${tenantFilter}
            LIMIT ${limit}
          `).then((r) => Array.from(r as Iterable<Record<string, unknown>>)),
        );
      } else {
        typeOrder.push('terminals');
        promises.push(Promise.resolve([]));
      }

      const results = await Promise.all(promises);

      const mapped: Record<string, unknown[]> = {};
      typeOrder.forEach((type, i) => {
        mapped[type] = results[i] ?? [];
      });

      const totalResults = Object.values(mapped).reduce((sum, arr) => sum + arr.length, 0);

      return {
        tenants: mapped.tenants ?? [],
        users: mapped.users ?? [],
        customers: mapped.customers ?? [],
        orders: mapped.orders ?? [],
        locations: mapped.locations ?? [],
        terminals: mapped.terminals ?? [],
        totalResults,
        query: q,
        searchTimeMs: Date.now() - start,
      };
    });

    return NextResponse.json({ data: result });
  },
  { permission: 'tenants.read' },
);
