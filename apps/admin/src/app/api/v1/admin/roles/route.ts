import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@oppsera/db';
import {
  platformAdminRoles,
  platformAdminRolePermissions,
  platformAdminRoleAssignments,
} from '@oppsera/db';
import { eq, sql, count } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── GET /api/v1/admin/roles — List roles ────────────────────────

export const GET = withAdminPermission(
  async () => {
    const roles = await db
      .select({
        id: platformAdminRoles.id,
        name: platformAdminRoles.name,
        description: platformAdminRoles.description,
        isSystem: platformAdminRoles.isSystem,
        createdAt: platformAdminRoles.createdAt,
      })
      .from(platformAdminRoles)
      .orderBy(platformAdminRoles.name);

    // Enrich with counts
    const permCounts = await db
      .select({
        roleId: platformAdminRolePermissions.roleId,
        cnt: count(),
      })
      .from(platformAdminRolePermissions)
      .groupBy(platformAdminRolePermissions.roleId);

    const assigneeCounts = await db
      .select({
        roleId: platformAdminRoleAssignments.roleId,
        cnt: count(),
      })
      .from(platformAdminRoleAssignments)
      .groupBy(platformAdminRoleAssignments.roleId);

    const permMap = new Map(permCounts.map((r) => [r.roleId, Number(r.cnt)]));
    const assigneeMap = new Map(assigneeCounts.map((r) => [r.roleId, Number(r.cnt)]));

    const items = roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionCount: permMap.get(r.id) ?? 0,
      assigneeCount: assigneeMap.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ data: items });
  },
  { permission: 'system.roles.view' },
);

// ── POST /api/v1/admin/roles — Create role ──────────────────────

const permissionSchema = z.object({
  module: z.string().min(1),
  submodule: z.string().nullable().optional(),
  action: z.string().min(1),
  scope: z.enum(['global', 'tenant', 'self']).default('global'),
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(permissionSchema).min(1, 'At least one permission is required'),
});

export const POST = withAdminPermission(
  async (req, session) => {
    const body = await req.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    // Check name uniqueness
    const [existing] = await db
      .select({ id: platformAdminRoles.id })
      .from(platformAdminRoles)
      .where(eq(platformAdminRoles.name, parsed.data.name.trim()))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'A role with this name already exists' } },
        { status: 409 },
      );
    }

    const roleId = generateUlid();
    await db.insert(platformAdminRoles).values({
      id: roleId,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() ?? null,
      isSystem: false,
    });

    if (parsed.data.permissions.length > 0) {
      await db.insert(platformAdminRolePermissions).values(
        parsed.data.permissions.map((p) => ({
          id: generateUlid(),
          roleId,
          module: p.module,
          submodule: p.submodule ?? null,
          action: p.action,
          scope: p.scope,
        })),
      );
    }

    await logAdminAudit({
      session,
      action: 'role.created',
      entityType: 'role',
      entityId: roleId,
      afterSnapshot: { name: parsed.data.name, permissions: parsed.data.permissions },
      ipAddress: getClientIp(req) ?? undefined,
    });

    return NextResponse.json({ data: { id: roleId, name: parsed.data.name } }, { status: 201 });
  },
  { permission: 'system.roles.edit' },
);
