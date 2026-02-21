// ── Staff Types ────────────────────────────────────────────────────

export type StaffStatus = 'active' | 'invited' | 'suspended' | 'deleted';

export interface StaffListItem {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: StaffStatus;
  legacyRole: string;
  roles: { id: string; name: string }[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StaffDetail extends StaffListItem {
  invitedByAdminId: string | null;
  invitedByAdminName: string | null;
  passwordResetRequired: boolean;
  updatedAt: string;
}

export interface CreateStaffInput {
  name: string;
  email: string;
  phone?: string;
  password?: string;
  roleIds: string[];
  sendInvite?: boolean;
}

export interface UpdateStaffInput {
  name?: string;
  email?: string;
  phone?: string;
  roleIds?: string[];
}

// ── Customer Types ─────────────────────────────────────────────────

export interface CustomerListItem {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  username: string | null;
  status: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  primaryRoleName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CustomerDetail {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  username: string | null;
  phone: string | null;
  status: string;
  passwordResetRequired: boolean;
  authProviderId: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  membershipStatus: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Admin Role Types ───────────────────────────────────────────────

export interface AdminRoleListItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  assigneeCount: number;
  createdAt: string;
}

export interface AdminRoleDetail extends AdminRoleListItem {
  permissions: AdminPermissionEntry[];
  assignees: { id: string; name: string; email: string }[];
}

export interface AdminPermissionEntry {
  id: string;
  module: string;
  submodule: string | null;
  action: string;
  scope: string;
}

// ── Audit Types ────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id: string;
  actorAdminId: string;
  actorAdminName: string;
  action: string;
  entityType: string;
  entityId: string;
  tenantId: string | null;
  reason: string | null;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  createdAt: string;
}
