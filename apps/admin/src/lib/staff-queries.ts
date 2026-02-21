import { db } from '@oppsera/db';
import {
  platformAdmins,
  platformAdminRoleAssignments,
  platformAdminRoles,
  platformAdminAuditLog,
} from '@oppsera/db';
import { eq, and, or, ilike, desc, lt, sql, count } from 'drizzle-orm';
import type { StaffListItem, StaffDetail, AdminAuditEntry } from '@/types/users';

// ── List Staff ──────────────────────────────────────────────────

interface StaffListFilters {
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

interface StaffListResult {
  items: StaffListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listStaff(filters: StaffListFilters): Promise<StaffListResult> {
  const limit = Math.min(filters.limit ?? 50, 100);

  // Build conditions
  const conditions = [];
  // Exclude soft-deleted by default unless specifically requesting them
  if (filters.status) {
    conditions.push(eq(platformAdmins.status, filters.status));
  } else {
    conditions.push(sql`${platformAdmins.status} != 'deleted'`);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(platformAdmins.name, term),
        ilike(platformAdmins.email, term),
      )!,
    );
  }
  if (filters.cursor) {
    conditions.push(lt(platformAdmins.createdAt, new Date(filters.cursor)));
  }

  const rows = await db
    .select()
    .from(platformAdmins)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(platformAdmins.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Enrich with role assignments
  const adminIds = items.map((a) => a.id);
  const roleRows = adminIds.length > 0
    ? await db
        .select({
          adminId: platformAdminRoleAssignments.adminId,
          roleId: platformAdminRoles.id,
          roleName: platformAdminRoles.name,
        })
        .from(platformAdminRoleAssignments)
        .innerJoin(platformAdminRoles, eq(platformAdminRoles.id, platformAdminRoleAssignments.roleId))
        .where(sql`${platformAdminRoleAssignments.adminId} IN ${adminIds}`)
    : [];

  const rolesByAdmin = new Map<string, { id: string; name: string }[]>();
  for (const r of roleRows) {
    const list = rolesByAdmin.get(r.adminId) ?? [];
    list.push({ id: r.roleId, name: r.roleName });
    rolesByAdmin.set(r.adminId, list);
  }

  const mapped: StaffListItem[] = items.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    phone: a.phone ?? null,
    status: a.status as StaffListItem['status'],
    legacyRole: a.role,
    roles: rolesByAdmin.get(a.id) ?? [],
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    items: mapped,
    cursor: hasMore && mapped.length > 0
      ? mapped[mapped.length - 1]!.createdAt
      : null,
    hasMore,
  };
}

// ── Get Staff By ID ─────────────────────────────────────────────

export async function getStaffById(id: string): Promise<StaffDetail | null> {
  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, id))
    .limit(1);

  if (!admin) return null;

  // Roles
  const roleRows = await db
    .select({
      roleId: platformAdminRoles.id,
      roleName: platformAdminRoles.name,
    })
    .from(platformAdminRoleAssignments)
    .innerJoin(platformAdminRoles, eq(platformAdminRoles.id, platformAdminRoleAssignments.roleId))
    .where(eq(platformAdminRoleAssignments.adminId, admin.id));

  // Invited by name
  let invitedByName: string | null = null;
  if (admin.invitedByAdminId) {
    const [inviter] = await db
      .select({ name: platformAdmins.name })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, admin.invitedByAdminId))
      .limit(1);
    invitedByName = inviter?.name ?? null;
  }

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    phone: admin.phone ?? null,
    status: admin.status as StaffDetail['status'],
    legacyRole: admin.role,
    roles: roleRows.map((r) => ({ id: r.roleId, name: r.roleName })),
    lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    createdAt: admin.createdAt.toISOString(),
    invitedByAdminId: admin.invitedByAdminId ?? null,
    invitedByAdminName: invitedByName,
    passwordResetRequired: admin.passwordResetRequired,
    updatedAt: admin.updatedAt.toISOString(),
  };
}

// ── Staff Audit Log ─────────────────────────────────────────────

interface AuditListFilters {
  adminId?: string;
  entityType?: string;
  entityId?: string;
  cursor?: string;
  limit?: number;
}

interface AuditListResult {
  items: AdminAuditEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listAdminAuditLog(filters: AuditListFilters): Promise<AuditListResult> {
  const limit = Math.min(filters.limit ?? 50, 100);

  const conditions = [];
  if (filters.adminId) {
    conditions.push(eq(platformAdminAuditLog.actorAdminId, filters.adminId));
  }
  if (filters.entityType) {
    conditions.push(eq(platformAdminAuditLog.entityType, filters.entityType));
  }
  if (filters.entityId) {
    conditions.push(eq(platformAdminAuditLog.entityId, filters.entityId));
  }
  if (filters.cursor) {
    conditions.push(lt(platformAdminAuditLog.createdAt, new Date(filters.cursor)));
  }

  const rows = await db
    .select({
      id: platformAdminAuditLog.id,
      actorAdminId: platformAdminAuditLog.actorAdminId,
      actorAdminName: platformAdmins.name,
      action: platformAdminAuditLog.action,
      entityType: platformAdminAuditLog.entityType,
      entityId: platformAdminAuditLog.entityId,
      tenantId: platformAdminAuditLog.tenantId,
      reason: platformAdminAuditLog.reason,
      beforeSnapshot: platformAdminAuditLog.beforeSnapshot,
      afterSnapshot: platformAdminAuditLog.afterSnapshot,
      createdAt: platformAdminAuditLog.createdAt,
    })
    .from(platformAdminAuditLog)
    .innerJoin(platformAdmins, eq(platformAdmins.id, platformAdminAuditLog.actorAdminId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(platformAdminAuditLog.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const mapped: AdminAuditEntry[] = items.map((r) => ({
    id: r.id,
    actorAdminId: r.actorAdminId,
    actorAdminName: r.actorAdminName,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    tenantId: r.tenantId,
    reason: r.reason,
    beforeSnapshot: (r.beforeSnapshot as Record<string, unknown>) ?? null,
    afterSnapshot: (r.afterSnapshot as Record<string, unknown>) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    items: mapped,
    cursor: hasMore && mapped.length > 0
      ? mapped[mapped.length - 1]!.createdAt
      : null,
    hasMore,
  };
}
