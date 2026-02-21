import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@oppsera/db';
import {
  platformAdminRoles,
  platformAdminRolePermissions,
  platformAdminRoleAssignments,
  platformAdmins,
} from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── GET /api/v1/admin/roles/:id — Role detail ──────────────────

export const GET = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const [role] = await db
      .select()
      .from(platformAdminRoles)
      .where(eq(platformAdminRoles.id, id))
      .limit(1);
    if (!role) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Role not found' } }, { status: 404 });
    }

    const permissions = await db
      .select()
      .from(platformAdminRolePermissions)
      .where(eq(platformAdminRolePermissions.roleId, id));

    const assigneeRows = await db
      .select({
        adminId: platformAdminRoleAssignments.adminId,
        adminName: platformAdmins.name,
        adminEmail: platformAdmins.email,
      })
      .from(platformAdminRoleAssignments)
      .innerJoin(platformAdmins, eq(platformAdmins.id, platformAdminRoleAssignments.adminId))
      .where(eq(platformAdminRoleAssignments.roleId, id));

    return NextResponse.json({
      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissionCount: permissions.length,
        assigneeCount: assigneeRows.length,
        createdAt: role.createdAt.toISOString(),
        permissions: permissions.map((p) => ({
          id: p.id,
          module: p.module,
          submodule: p.submodule,
          action: p.action,
          scope: p.scope,
        })),
        assignees: assigneeRows.map((a) => ({
          id: a.adminId,
          name: a.adminName,
          email: a.adminEmail,
        })),
      },
    });
  },
  { permission: 'system.roles.view' },
);

// ── PATCH /api/v1/admin/roles/:id — Update role ────────────────

const permissionSchema = z.object({
  module: z.string().min(1),
  submodule: z.string().nullable().optional(),
  action: z.string().min(1),
  scope: z.enum(['global', 'tenant', 'self']).default('global'),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(permissionSchema).optional(),
});

export const PATCH = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const [role] = await db
      .select()
      .from(platformAdminRoles)
      .where(eq(platformAdminRoles.id, id))
      .limit(1);
    if (!role) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Role not found' } }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    // System roles: cannot rename
    if (role.isSystem && parsed.data.name && parsed.data.name !== role.name) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Cannot rename system roles' } },
        { status: 403 },
      );
    }

    // Update role metadata
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name) updates.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined) updates.description = parsed.data.description?.trim() ?? null;

    await db.update(platformAdminRoles).set(updates).where(eq(platformAdminRoles.id, id));

    // Replace permissions if provided
    if (parsed.data.permissions) {
      await db.delete(platformAdminRolePermissions)
        .where(eq(platformAdminRolePermissions.roleId, id));

      if (parsed.data.permissions.length > 0) {
        await db.insert(platformAdminRolePermissions).values(
          parsed.data.permissions.map((p) => ({
            id: generateUlid(),
            roleId: id,
            module: p.module,
            submodule: p.submodule ?? null,
            action: p.action,
            scope: p.scope,
          })),
        );
      }
    }

    await logAdminAudit({
      session,
      action: 'role.updated',
      entityType: 'role',
      entityId: id,
      beforeSnapshot: { name: role.name },
      afterSnapshot: parsed.data as unknown as Record<string, unknown>,
      ipAddress: getClientIp(req) ?? undefined,
    });

    return NextResponse.json({ data: { ok: true } });
  },
  { permission: 'system.roles.edit' },
);

// ── DELETE /api/v1/admin/roles/:id — Delete role ────────────────

export const DELETE = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const [role] = await db
      .select()
      .from(platformAdminRoles)
      .where(eq(platformAdminRoles.id, id))
      .limit(1);
    if (!role) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Role not found' } }, { status: 404 });
    }
    if (role.isSystem) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Cannot delete system roles' } },
        { status: 403 },
      );
    }

    // Delete cascade: permissions + assignments removed by FK cascade
    await db.delete(platformAdminRoles).where(eq(platformAdminRoles.id, id));

    await logAdminAudit({
      session,
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      beforeSnapshot: { name: role.name, isSystem: role.isSystem },
      ipAddress: getClientIp(req) ?? undefined,
    });

    return NextResponse.json({ data: { ok: true } });
  },
  { minRole: 'super_admin', permission: 'system.roles.edit' },
);
