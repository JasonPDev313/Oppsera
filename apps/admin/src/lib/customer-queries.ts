import { and, desc, eq, ilike, lt, or, sql } from 'drizzle-orm';
import { db, users, memberships, tenants, roles, userRoles } from '@oppsera/db';

// ── List Customers (cross-tenant) ──────────────────────────────

interface CustomerListFilters {
  tenantId?: string;
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export async function listCustomers(filters: CustomerListFilters) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);

  const conditions = [];

  if (filters.tenantId) {
    conditions.push(eq(memberships.tenantId, filters.tenantId));
  }

  if (filters.status) {
    conditions.push(eq(users.status, filters.status));
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(users.email, pattern),
        ilike(users.name, pattern),
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
        ilike(users.username, pattern),
      ),
    );
  }

  if (filters.cursor) {
    conditions.push(lt(users.id, filters.cursor));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      displayName: users.displayName,
      username: users.username,
      status: users.status,
      primaryRoleId: users.primaryRoleId,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      tenantId: memberships.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(where)
    .orderBy(desc(users.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Resolve primary role names in batch
  const roleIds = [...new Set(items.map((u) => u.primaryRoleId).filter(Boolean))] as string[];
  const roleMap = new Map<string, string>();
  if (roleIds.length > 0) {
    const roleRows = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(sql`${roles.id} IN ${roleIds}`);
    for (const r of roleRows) {
      roleMap.set(r.id, r.name);
    }
  }

  return {
    items: items.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      displayName: u.displayName ?? null,
      username: u.username ?? null,
      status: u.status,
      tenantId: u.tenantId,
      tenantName: u.tenantName,
      tenantSlug: u.tenantSlug,
      primaryRoleName: u.primaryRoleId ? roleMap.get(u.primaryRoleId) ?? null : null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    cursor: hasMore ? items[items.length - 1]!.id : null,
    hasMore,
  };
}

// ── Get Customer Detail ─────────────────────────────────────────

export async function getCustomerById(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      displayName: users.displayName,
      username: users.username,
      phone: users.phone,
      status: users.status,
      passwordResetRequired: users.passwordResetRequired,
      authProviderId: users.authProviderId,
      primaryRoleId: users.primaryRoleId,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      tenantId: memberships.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      membershipStatus: memberships.status,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  // Fetch roles
  const roleRows = await db
    .select({ id: roles.id, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.tenantId, row.tenantId), eq(userRoles.userId, userId)));

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    displayName: row.displayName ?? null,
    username: row.username ?? null,
    phone: row.phone ?? null,
    status: row.status,
    passwordResetRequired: row.passwordResetRequired,
    authProviderId: row.authProviderId ?? null,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    tenantSlug: row.tenantSlug,
    roles: roleRows,
    locations: [] as { id: string; name: string }[],
    membershipStatus: row.membershipStatus ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
