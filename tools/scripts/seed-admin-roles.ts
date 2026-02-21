/**
 * Seed default admin roles and assign existing platform admins.
 *
 * Usage: npx tsx tools/scripts/seed-admin-roles.ts
 *
 * Idempotent — safe to run multiple times.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '@oppsera/db';
import {
  platformAdmins,
  platformAdminRoles,
  platformAdminRolePermissions,
  platformAdminRoleAssignments,
} from '@oppsera/db';
import { eq, sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── Permission Definitions ──────────────────────────────────────

interface PermDef {
  module: string;
  submodule: string | null;
  action: string;
  scope: string;
}

interface RoleDef {
  name: string;
  description: string;
  permissions: PermDef[];
}

const SYSTEM_ROLES: RoleDef[] = [
  {
    name: 'Super Admin',
    description: 'Full CRUD + DELETE across all modules. Can manage other admins and roles.',
    permissions: [
      { module: '*', submodule: null, action: '*', scope: 'global' },
    ],
  },
  {
    name: 'Admin',
    description: 'Full CRUD across all modules. Cannot DELETE staff or manage roles.',
    permissions: [
      // Tenants
      { module: 'tenants', submodule: null, action: 'view', scope: 'global' },
      { module: 'tenants', submodule: null, action: 'create', scope: 'global' },
      { module: 'tenants', submodule: null, action: 'edit', scope: 'global' },
      // Users — Staff
      { module: 'users', submodule: 'staff', action: 'view', scope: 'global' },
      { module: 'users', submodule: 'staff', action: 'create', scope: 'global' },
      { module: 'users', submodule: 'staff', action: 'edit', scope: 'global' },
      { module: 'users', submodule: 'staff', action: 'invite', scope: 'global' },
      { module: 'users', submodule: 'staff', action: 'reset_password', scope: 'global' },
      { module: 'users', submodule: 'staff', action: 'suspend', scope: 'global' },
      // Users — Customers
      { module: 'users', submodule: 'customers', action: 'view', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'create', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'edit', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'invite', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'reset_password', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'suspend', scope: 'global' },
      // AI Train
      { module: 'ai_train', submodule: null, action: 'view', scope: 'global' },
      { module: 'ai_train', submodule: 'examples', action: 'create', scope: 'global' },
      { module: 'ai_train', submodule: 'examples', action: 'edit', scope: 'global' },
      { module: 'ai_train', submodule: 'examples', action: 'delete', scope: 'global' },
      // Evaluations
      { module: 'evaluations', submodule: null, action: 'view', scope: 'global' },
      { module: 'evaluations', submodule: null, action: 'edit', scope: 'global' },
      // System
      { module: 'system', submodule: null, action: 'view', scope: 'global' },
      { module: 'system', submodule: 'roles', action: 'view', scope: 'global' },
    ],
  },
  {
    name: 'Support',
    description: 'View most modules. Can reset passwords and resend invites.',
    permissions: [
      { module: 'tenants', submodule: null, action: 'view', scope: 'global' },
      { module: 'users', submodule: 'staff', action: 'view', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'view', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'reset_password', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'invite', scope: 'global' },
      { module: 'ai_train', submodule: null, action: 'view', scope: 'global' },
    ],
  },
  {
    name: 'Analyst',
    description: 'View reporting + AI Train golden examples. Cannot see eval chat history by default.',
    permissions: [
      { module: 'tenants', submodule: null, action: 'view', scope: 'global' },
      { module: 'ai_train', submodule: null, action: 'view', scope: 'global' },
      { module: 'ai_train', submodule: 'examples', action: 'view', scope: 'global' },
      { module: 'evaluations', submodule: null, action: 'view', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'view', scope: 'global' },
    ],
  },
  {
    name: 'Read-Only',
    description: 'View-only access across all modules.',
    permissions: [
      { module: 'tenants', submodule: null, action: 'view', scope: 'global' },
      { module: 'users', submodule: 'staff', action: 'view', scope: 'global' },
      { module: 'users', submodule: 'customers', action: 'view', scope: 'global' },
      { module: 'ai_train', submodule: null, action: 'view', scope: 'global' },
      { module: 'system', submodule: null, action: 'view', scope: 'global' },
    ],
  },
];

// ── Legacy role → new role mapping ──────────────────────────────

const LEGACY_ROLE_MAP: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Read-Only',
};

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding admin roles...');

  for (const roleDef of SYSTEM_ROLES) {
    // Upsert role
    const [existing] = await db
      .select({ id: platformAdminRoles.id })
      .from(platformAdminRoles)
      .where(eq(platformAdminRoles.name, roleDef.name))
      .limit(1);

    let roleId: string;
    if (existing) {
      roleId = existing.id;
      console.log(`  Role "${roleDef.name}" already exists (${roleId}), updating permissions...`);
    } else {
      roleId = generateUlid();
      await db.insert(platformAdminRoles).values({
        id: roleId,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
      });
      console.log(`  Created role "${roleDef.name}" (${roleId})`);
    }

    // Replace permissions (delete + insert)
    await db.delete(platformAdminRolePermissions)
      .where(eq(platformAdminRolePermissions.roleId, roleId));

    if (roleDef.permissions.length > 0) {
      await db.insert(platformAdminRolePermissions).values(
        roleDef.permissions.map((p) => ({
          id: generateUlid(),
          roleId,
          module: p.module,
          submodule: p.submodule,
          action: p.action,
          scope: p.scope,
        })),
      );
      console.log(`    → ${roleDef.permissions.length} permissions set`);
    }
  }

  // Assign existing admins to matching roles
  console.log('\nAssigning existing admins to roles...');
  const admins = await db.select().from(platformAdmins);
  const roles = await db.select().from(platformAdminRoles);
  const roleByName = new Map(roles.map((r) => [r.name, r.id]));

  for (const admin of admins) {
    const targetRoleName = LEGACY_ROLE_MAP[admin.role] ?? 'Read-Only';
    const targetRoleId = roleByName.get(targetRoleName);
    if (!targetRoleId) {
      console.log(`  ⚠ No role "${targetRoleName}" found for admin ${admin.email}`);
      continue;
    }

    // Check if assignment already exists
    const [existingAssignment] = await db
      .select({ id: platformAdminRoleAssignments.id })
      .from(platformAdminRoleAssignments)
      .where(
        sql`${platformAdminRoleAssignments.adminId} = ${admin.id}
            AND ${platformAdminRoleAssignments.roleId} = ${targetRoleId}`,
      )
      .limit(1);

    if (existingAssignment) {
      console.log(`  ${admin.email} → "${targetRoleName}" (already assigned)`);
      continue;
    }

    await db.insert(platformAdminRoleAssignments).values({
      id: generateUlid(),
      adminId: admin.id,
      roleId: targetRoleId,
    });
    console.log(`  ${admin.email} → "${targetRoleName}" ✓`);
  }

  console.log('\nDone!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
