import { db } from '@oppsera/db';
import {
  platformAdmins,
  platformAdminRoleAssignments,
} from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateUlid } from '@oppsera/shared';
import { createHash, randomBytes } from 'crypto';
import type { AdminSession } from './auth';
import { logAdminAudit, sanitizeSnapshot } from './admin-audit';
import { invalidateAdminPermissionCache } from './admin-permissions';
import { getStaffById } from './staff-queries';
import type { StaffDetail } from '@/types/users';

// ── Create Staff ────────────────────────────────────────────────

interface CreateStaffInput {
  name: string;
  email: string;
  phone?: string;
  password?: string;
  roleIds: string[];
  sendInvite?: boolean;
}

export async function createStaff(
  input: CreateStaffInput,
  session: AdminSession,
  ipAddress?: string,
): Promise<StaffDetail> {
  const normalizedEmail = input.email.toLowerCase().trim();

  // Check email uniqueness
  const [existing] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.email, normalizedEmail))
    .limit(1);
  if (existing) {
    throw new Error('A staff member with this email already exists');
  }

  const adminId = generateUlid();
  const isInvite = input.sendInvite && !input.password;

  let passwordHash: string;
  let inviteTokenHash: string | null = null;
  let inviteExpiresAt: Date | null = null;
  let status: string;

  if (isInvite) {
    // Placeholder hash — user will set password via invite link
    passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const token = randomBytes(32).toString('base64url');
    inviteTokenHash = createHash('sha256').update(token).digest('hex');
    inviteExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
    status = 'invited';
  } else if (input.password) {
    passwordHash = await bcrypt.hash(input.password, 12);
    status = 'active';
  } else {
    throw new Error('Either password or sendInvite must be provided');
  }

  // Insert admin
  await db.insert(platformAdmins).values({
    id: adminId,
    email: normalizedEmail,
    name: input.name.trim(),
    phone: input.phone?.trim() ?? null,
    passwordHash,
    role: 'viewer', // Legacy role defaults to viewer; real perms come from role assignments
    isActive: status === 'active' || status === 'invited',
    status,
    invitedByAdminId: session.adminId,
    inviteTokenHash,
    inviteExpiresAt,
    passwordResetRequired: false,
  });

  // Assign roles
  if (input.roleIds.length > 0) {
    await db.insert(platformAdminRoleAssignments).values(
      input.roleIds.map((roleId) => ({
        id: generateUlid(),
        adminId,
        roleId,
        assignedByAdminId: session.adminId,
      })),
    );
  }

  const created = await getStaffById(adminId);

  // Audit
  await logAdminAudit({
    session,
    action: isInvite ? 'staff.invited' : 'staff.created',
    entityType: 'staff',
    entityId: adminId,
    afterSnapshot: created ? sanitizeSnapshot(created as unknown as Record<string, unknown>) : undefined,
    ipAddress: ipAddress ?? undefined,
  });

  return created!;
}

// ── Update Staff ────────────────────────────────────────────────

interface UpdateStaffInput {
  name?: string;
  email?: string;
  phone?: string;
  roleIds?: string[];
}

export async function updateStaff(
  id: string,
  input: UpdateStaffInput,
  session: AdminSession,
  ipAddress?: string,
): Promise<StaffDetail> {
  const before = await getStaffById(id);
  if (!before) throw new Error('Staff member not found');
  if (before.status === 'deleted') throw new Error('Cannot update a deleted staff member');

  // Update fields
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.email !== undefined) {
    const normalizedEmail = input.email.toLowerCase().trim();
    if (normalizedEmail !== before.email) {
      // Check uniqueness
      const [existing] = await db
        .select({ id: platformAdmins.id })
        .from(platformAdmins)
        .where(eq(platformAdmins.email, normalizedEmail))
        .limit(1);
      if (existing) throw new Error('A staff member with this email already exists');
      updates.email = normalizedEmail;
    }
  }

  if (Object.keys(updates).length > 1) {
    await db.update(platformAdmins).set(updates).where(eq(platformAdmins.id, id));
  }

  // Update roles if provided (delete+insert pattern)
  if (input.roleIds !== undefined) {
    await db.delete(platformAdminRoleAssignments)
      .where(eq(platformAdminRoleAssignments.adminId, id));

    if (input.roleIds.length > 0) {
      await db.insert(platformAdminRoleAssignments).values(
        input.roleIds.map((roleId) => ({
          id: generateUlid(),
          adminId: id,
          roleId,
          assignedByAdminId: session.adminId,
        })),
      );
    }
    invalidateAdminPermissionCache(id);
  }

  const after = await getStaffById(id);

  await logAdminAudit({
    session,
    action: 'staff.updated',
    entityType: 'staff',
    entityId: id,
    beforeSnapshot: sanitizeSnapshot(before as unknown as Record<string, unknown>),
    afterSnapshot: after ? sanitizeSnapshot(after as unknown as Record<string, unknown>) : undefined,
    ipAddress: ipAddress ?? undefined,
  });

  return after!;
}

// ── Suspend / Unsuspend ─────────────────────────────────────────

export async function suspendStaff(
  id: string,
  reason: string,
  session: AdminSession,
  ipAddress?: string,
): Promise<void> {
  if (id === session.adminId) throw new Error('Cannot suspend yourself');

  const admin = await getStaffById(id);
  if (!admin) throw new Error('Staff member not found');
  if (admin.status === 'deleted') throw new Error('Cannot suspend a deleted staff member');
  if (admin.status === 'suspended') throw new Error('Staff member is already suspended');

  await db.update(platformAdmins).set({
    status: 'suspended',
    isActive: false,
    updatedAt: new Date(),
  }).where(eq(platformAdmins.id, id));

  invalidateAdminPermissionCache(id);

  await logAdminAudit({
    session,
    action: 'staff.suspended',
    entityType: 'staff',
    entityId: id,
    reason,
    ipAddress: ipAddress ?? undefined,
  });
}

export async function unsuspendStaff(
  id: string,
  session: AdminSession,
  ipAddress?: string,
): Promise<void> {
  const admin = await getStaffById(id);
  if (!admin) throw new Error('Staff member not found');
  if (admin.status !== 'suspended') throw new Error('Staff member is not suspended');

  await db.update(platformAdmins).set({
    status: 'active',
    isActive: true,
    updatedAt: new Date(),
  }).where(eq(platformAdmins.id, id));

  invalidateAdminPermissionCache(id);

  await logAdminAudit({
    session,
    action: 'staff.unsuspended',
    entityType: 'staff',
    entityId: id,
    ipAddress: ipAddress ?? undefined,
  });
}

// ── Delete (Super Admin only, soft delete) ──────────────────────

export async function deleteStaff(
  id: string,
  reason: string,
  session: AdminSession,
  ipAddress?: string,
): Promise<void> {
  if (session.role !== 'super_admin') throw new Error('Only Super Admin can delete staff');
  if (id === session.adminId) throw new Error('Cannot delete yourself');

  const before = await getStaffById(id);
  if (!before) throw new Error('Staff member not found');
  if (before.status === 'deleted') throw new Error('Staff member is already deleted');

  // Soft delete: set status + deactivate
  await db.update(platformAdmins).set({
    status: 'deleted',
    isActive: false,
    updatedAt: new Date(),
  }).where(eq(platformAdmins.id, id));

  // Remove role assignments
  await db.delete(platformAdminRoleAssignments)
    .where(eq(platformAdminRoleAssignments.adminId, id));

  invalidateAdminPermissionCache(id);

  await logAdminAudit({
    session,
    action: 'staff.deleted',
    entityType: 'staff',
    entityId: id,
    beforeSnapshot: sanitizeSnapshot(before as unknown as Record<string, unknown>),
    reason,
    ipAddress: ipAddress ?? undefined,
  });
}

// ── Reset Password ──────────────────────────────────────────────

export async function resetStaffPassword(
  id: string,
  session: AdminSession,
  ipAddress?: string,
): Promise<void> {
  const admin = await getStaffById(id);
  if (!admin) throw new Error('Staff member not found');
  if (admin.status === 'deleted') throw new Error('Cannot reset password for deleted staff');

  // Generate a new invite token for password reset
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await db.update(platformAdmins).set({
    passwordResetRequired: true,
    inviteTokenHash: tokenHash,
    inviteExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    updatedAt: new Date(),
  }).where(eq(platformAdmins.id, id));

  await logAdminAudit({
    session,
    action: 'staff.password_reset',
    entityType: 'staff',
    entityId: id,
    ipAddress: ipAddress ?? undefined,
  });

  // TODO: Send password reset email with token
}

// ── Resend Invite ───────────────────────────────────────────────

export async function resendStaffInvite(
  id: string,
  session: AdminSession,
  ipAddress?: string,
): Promise<void> {
  const admin = await getStaffById(id);
  if (!admin) throw new Error('Staff member not found');
  if (admin.status !== 'invited') throw new Error('Staff member is not in invited status');

  // Generate new invite token
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  await db.update(platformAdmins).set({
    inviteTokenHash: tokenHash,
    inviteExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    updatedAt: new Date(),
  }).where(eq(platformAdmins.id, id));

  await logAdminAudit({
    session,
    action: 'staff.invite_resent',
    entityType: 'staff',
    entityId: id,
    ipAddress: ipAddress ?? undefined,
  });

  // TODO: Send invite email with token
}
