import { pgTable, text, boolean, timestamp, jsonb, uniqueIndex, index, integer } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Platform Admins ──────────────────────────────────────────────
// NOT tenant-scoped — these are OppsEra internal operators.
// No RLS on this table.

export const platformAdmins = pgTable('platform_admins', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  // Legacy role: 'super_admin' | 'admin' | 'viewer'
  // Kept for backward compat with login route + withAdminAuth middleware.
  // New code should use platformAdminRoleAssignments for granular permissions.
  isActive: boolean('is_active').notNull().default(true),
  // Kept in sync with status for backward compat (login route checks isActive).
  phone: text('phone'),
  status: text('status').notNull().default('active'),
  // status: 'active' | 'invited' | 'suspended' | 'deleted'
  invitedByAdminId: text('invited_by_admin_id'),
  inviteTokenHash: text('invite_token_hash'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  passwordResetRequired: boolean('password_reset_required').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Platform Admin Roles ─────────────────────────────────────────
// Named roles for admin RBAC (Super Admin, Admin, Support, Analyst, Read-Only).
// System roles cannot be deleted or renamed.

export const platformAdminRoles = pgTable('platform_admin_roles', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  name: text('name').notNull().unique(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Platform Admin Role Permissions ──────────────────────────────
// Granular permission grants per role.
// Permission string composable as: {module}.{submodule}.{action} or {module}.{action}
//
// module:    'tenants' | 'users' | 'billing' | 'ai_train' | 'evaluations' | 'system'
// submodule: 'staff' | 'customers' | 'examples' | 'eval_history' | null (whole module)
// action:    'view' | 'create' | 'edit' | 'invite' | 'reset_password' | 'suspend' | 'export' | 'delete'
// scope:     'global' | 'tenant' | 'self'

export const platformAdminRolePermissions = pgTable(
  'platform_admin_role_permissions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    roleId: text('role_id')
      .notNull()
      .references(() => platformAdminRoles.id, { onDelete: 'cascade' }),
    module: text('module').notNull(),
    submodule: text('submodule'),
    action: text('action').notNull(),
    scope: text('scope').notNull().default('global'),
  },
  (table) => [
    uniqueIndex('uq_platform_role_perm').on(table.roleId, table.module, table.submodule, table.action),
    index('idx_platform_role_perm_role').on(table.roleId),
  ],
);

// ── Platform Admin Role Assignments ──────────────────────────────
// Many-to-many: admins can have multiple roles.

export const platformAdminRoleAssignments = pgTable(
  'platform_admin_role_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    adminId: text('admin_id')
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => platformAdminRoles.id, { onDelete: 'cascade' }),
    assignedByAdminId: text('assigned_by_admin_id').references(() => platformAdmins.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_platform_admin_role_assignment').on(table.adminId, table.roleId),
    index('idx_platform_admin_role_admin').on(table.adminId),
  ],
);

// ── Platform Admin Audit Log ─────────────────────────────────────
// Captures all admin portal actions. Separate from tenant audit_log.
// No RLS — platform-level.

export const platformAdminAuditLog = pgTable(
  'platform_admin_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    actorAdminId: text('actor_admin_id')
      .notNull()
      .references(() => platformAdmins.id),
    action: text('action').notNull(),
    // e.g. 'staff.created', 'staff.suspended', 'customer.password_reset', 'role.updated'
    entityType: text('entity_type').notNull(),
    // 'staff' | 'customer' | 'role' | 'tenant'
    entityId: text('entity_id').notNull(),
    tenantId: text('tenant_id'),
    // null for platform-level entities, set for customer operations
    beforeSnapshot: jsonb('before_snapshot'),
    afterSnapshot: jsonb('after_snapshot'),
    reason: text('reason'),
    ipAddress: text('ip_address'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_platform_audit_actor').on(table.actorAdminId, table.createdAt),
    index('idx_platform_audit_entity').on(table.entityType, table.entityId, table.createdAt),
    index('idx_platform_audit_action').on(table.action, table.createdAt),
  ],
);

// ── Admin Impersonation Sessions ─────────────────────────────────
// Tracks when platform admins impersonate tenant accounts for support.
// No RLS — platform-level table.

export const adminImpersonationSessions = pgTable(
  'admin_impersonation_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    adminId: text('admin_id')
      .notNull()
      .references(() => platformAdmins.id),
    adminEmail: text('admin_email').notNull(),
    adminName: text('admin_name').notNull(),
    tenantId: text('tenant_id').notNull(),
    tenantName: text('tenant_name').notNull(),
    status: text('status').notNull().default('pending'),
    // status: 'pending' | 'active' | 'ended' | 'expired'
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endReason: text('end_reason'),
    // end_reason: 'user_exit' | 'admin_terminate' | 'expired' | 'new_session'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    actionCount: integer('action_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_imp_sessions_admin').on(table.adminId, table.createdAt),
    index('idx_imp_sessions_tenant').on(table.tenantId, table.createdAt),
  ],
);

// ── Tenant Onboarding Checklists (migration 0195) ──────────────
// Per-tenant onboarding steps derived from industry templates.

export const tenantOnboardingChecklists = pgTable(
  'tenant_onboarding_checklists',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    stepLabel: text('step_label').notNull(),
    stepGroup: text('step_group').notNull().default('general'),
    status: text('status').notNull().default('pending'),
    // status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked'
    sortOrder: integer('sort_order').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by'),
    blockerNotes: text('blocker_notes'),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_onboarding_tenant_step').on(table.tenantId, table.stepKey),
    index('idx_tenant_onboarding_tenant').on(table.tenantId),
  ],
);

// ── SuperAdmin Support Notes (migration 0195) ──────────────────
// Internal notes by platform admins about a tenant.

export const superadminSupportNotes = pgTable(
  'superadmin_support_notes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    authorAdminId: text('author_admin_id')
      .notNull()
      .references(() => platformAdmins.id),
    content: text('content').notNull(),
    noteType: text('note_type').notNull().default('general'),
    // noteType: 'general' | 'support_ticket' | 'escalation' | 'implementation' | 'financial'
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_support_notes_tenant').on(table.tenantId, table.createdAt),
    index('idx_support_notes_author').on(table.authorAdminId),
  ],
);

// ── Onboarding Step Templates (migration 0195) ─────────────────
// Industry-specific onboarding checklist templates.

export const onboardingStepTemplates = pgTable(
  'onboarding_step_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    industry: text('industry').notNull(),
    stepKey: text('step_key').notNull(),
    stepLabel: text('step_label').notNull(),
    stepGroup: text('step_group').notNull().default('general'),
    sortOrder: integer('sort_order').notNull().default(0),
    autoCheckQuery: text('auto_check_query'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_onboarding_templates_industry_step').on(table.industry, table.stepKey),
  ],
);
