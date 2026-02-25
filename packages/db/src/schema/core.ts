import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  numeric,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';

// ── Tenants ──────────────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),
  billingCustomerId: text('billing_customer_id'),
  // ── ERP dual-mode tier (migration 0187) ──
  businessTier: text('business_tier').notNull().default('SMB'), // 'SMB' | 'MID_MARKET' | 'ENTERPRISE'
  businessVertical: text('business_vertical').notNull().default('general'),
  tierOverride: boolean('tier_override').notNull().default(false),
  tierOverrideReason: text('tier_override_reason'),
  tierLastEvaluatedAt: timestamp('tier_last_evaluated_at', { withTimezone: true }),
  // ── SuperAdmin Phase 1A (migration 0195) ──
  industry: text('industry'), // 'golf' | 'restaurant' | 'hotel' | 'retail' | 'marina' | 'general'
  onboardingStatus: text('onboarding_status').notNull().default('pending'),
  // onboardingStatus: 'pending' | 'in_progress' | 'completed' | 'stalled'
  primaryContactEmail: text('primary_contact_email'),
  primaryContactName: text('primary_contact_name'),
  primaryContactPhone: text('primary_contact_phone'),
  internalNotes: text('internal_notes'),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendedReason: text('suspended_reason'),
  metadata: jsonb('metadata').notNull().default('{}'),
  healthGrade: text('health_grade').notNull().default('A'),
  // healthGrade: 'A' | 'B' | 'C' | 'D' | 'F'
  totalLocations: integer('total_locations').notNull().default(0),
  totalUsers: integer('total_users').notNull().default(0),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Locations ────────────────────────────────────────────────────
export const locations = pgTable(
  'locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('America/New_York'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country').notNull().default('US'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    isActive: boolean('is_active').notNull().default(true),

    // ── Location hierarchy (migration 0095) ──
    // 'site' = physical address (files taxes), 'venue' = operational unit within a site
    parentLocationId: text('parent_location_id'),
    locationType: text('location_type').notNull().default('site'),

    // ── Location gap fields (migration 0042) ──
    phone: text('phone'),
    email: text('email'),
    websiteUrl: text('website_url'),
    logoUrl: text('logo_url'),
    description: text('description'),
    socialLinks: jsonb('social_links'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_locations_tenant').on(table.tenantId),
    index('idx_locations_parent').on(table.tenantId, table.parentLocationId),
  ],
);

// ── Users ────────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').references(() => tenants.id),
    email: text('email').notNull(),
    username: text('username'),
    name: text('name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    displayName: text('display_name'),
    status: text('status').notNull().default('active'),
    primaryRoleId: text('primary_role_id'),
    tabColor: text('tab_color'),
    externalPayrollEmployeeId: text('external_payroll_employee_id'),
    passwordHash: text('password_hash'),
    passwordResetRequired: boolean('password_reset_required').notNull().default(false),
    authProviderId: text('auth_provider_id').unique(),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    phone: text('phone'),
    posPin: text('pos_pin'),
    overridePin: text('override_pin'),
    employeeColor: text('employee_color'),
    externalPayrollId: text('external_payroll_id'),
    profileImageUrl: text('profile_image_url'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id'),
    updatedByUserId: text('updated_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_users_tenant_email').on(table.tenantId, table.email),
    uniqueIndex('uq_users_tenant_username').on(table.tenantId, table.username),
    index('idx_users_tenant').on(table.tenantId),
    index('idx_users_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── Memberships ──────────────────────────────────────────────────
export const memberships = pgTable(
  'memberships',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_memberships_tenant_user').on(table.tenantId, table.userId),
    index('idx_memberships_user').on(table.userId),
  ],
);

export const userSecurity = pgTable('user_security', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  uniqueLoginPinHash: text('unique_login_pin_hash'),
  posOverridePinHash: text('pos_override_pin_hash'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Roles ────────────────────────────────────────────────────────
export const roles = pgTable(
  'roles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_roles_tenant_name').on(table.tenantId, table.name)],
);

// ── Role Permissions ─────────────────────────────────────────────
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
  },
  (table) => [uniqueIndex('uq_role_permissions_role_perm').on(table.roleId, table.permission)],
);

// ── Role Assignments ─────────────────────────────────────────────
export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    locationId: text('location_id').references(() => locations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_role_assignments_user').on(table.tenantId, table.userId),
    index('idx_role_assignments_perm_lookup').on(table.tenantId, table.userId, table.locationId, table.roleId),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_user_roles_user_role').on(table.userId, table.roleId),
    index('idx_user_roles_tenant_user').on(table.tenantId, table.userId),
  ],
);

export const userLocations = pgTable(
  'user_locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_user_locations_user_location').on(table.userId, table.locationId),
    index('idx_user_locations_tenant_user').on(table.tenantId, table.userId),
  ],
);

// ── Role Access Scoping ──────────────────────────────────────────
// Empty table = unrestricted (role sees everything at that level).
// Adding rows restricts the role to only those resources.

export const roleLocationAccess = pgTable(
  'role_location_access',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_role_location_access').on(table.roleId, table.locationId),
    index('idx_rla_tenant_role').on(table.tenantId, table.roleId),
  ],
);

export const roleProfitCenterAccess = pgTable(
  'role_profit_center_access',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    profitCenterId: text('profit_center_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_role_pc_access').on(table.roleId, table.profitCenterId),
    index('idx_rpca_tenant_role').on(table.tenantId, table.roleId),
  ],
);

export const roleTerminalAccess = pgTable(
  'role_terminal_access',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    terminalId: text('terminal_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_role_terminal_access').on(table.roleId, table.terminalId),
    index('idx_rta_tenant_role').on(table.tenantId, table.roleId),
  ],
);

export const userInvites = pgTable(
  'user_invites',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: text('email').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    invitedByUserId: text('invited_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_user_invites_token_hash').on(table.tokenHash),
    index('idx_user_invites_tenant_email').on(table.tenantId, table.email),
    index('idx_user_invites_user').on(table.userId),
  ],
);

// ── Entitlements ─────────────────────────────────────────────────
export const entitlements = pgTable(
  'entitlements',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    moduleKey: text('module_key').notNull(),
    planTier: text('plan_tier').notNull().default('standard'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    accessMode: text('access_mode').notNull().default('full'),
    limits: jsonb('limits').notNull().default('{}'),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    changedBy: text('changed_by'),
    changeReason: text('change_reason'),
    previousMode: text('previous_mode'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_entitlements_tenant_module').on(table.tenantId, table.moduleKey),
  ],
);

// ── Entitlement Change Log (append-only) ──────────────────────────
export const entitlementChangeLog = pgTable(
  'entitlement_change_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    moduleKey: text('module_key').notNull(),
    previousMode: text('previous_mode').notNull(),
    newMode: text('new_mode').notNull(),
    changedBy: text('changed_by').notNull(),
    changeReason: text('change_reason'),
    changeSource: text('change_source').notNull().default('manual'),
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_entitlement_change_log_tenant').on(table.tenantId, table.createdAt),
    index('idx_entitlement_change_log_module').on(table.tenantId, table.moduleKey, table.createdAt),
  ],
);

// ── Module Templates ──────────────────────────────────────────────
export const moduleTemplates = pgTable(
  'module_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    name: text('name').notNull(),
    description: text('description'),
    businessType: text('business_type'),
    isSystem: boolean('is_system').notNull().default(false),
    modules: jsonb('modules').notNull().default('[]'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

// ── Audit Log (partitioned by month on created_at) ──────────────
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').notNull().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id'),
    actorUserId: text('actor_user_id'),
    actorType: text('actor_type').notNull().default('user'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    changes: jsonb('changes'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    index('idx_audit_tenant_created').on(table.tenantId, table.createdAt),
    index('idx_audit_entity').on(table.tenantId, table.entityType, table.entityId),
    index('idx_audit_actor').on(table.tenantId, table.actorUserId, table.createdAt),
    index('idx_audit_action').on(table.tenantId, table.action, table.createdAt),
  ],
);

// ── Event Outbox ─────────────────────────────────────────────────
export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    eventType: text('event_type').notNull(),
    eventId: text('event_id').notNull().unique(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_outbox_unpublished').on(table.publishedAt)],
);

// ── Processed Events ─────────────────────────────────────────────
export const processedEvents = pgTable(
  'processed_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id'),
    eventId: text('event_id').notNull(),
    consumerName: text('consumer_name').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_processed_events').on(table.eventId, table.consumerName)],
);

// ── Event Dead Letters ───────────────────────────────────────────
export const eventDeadLetters = pgTable(
  'event_dead_letters',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id'),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    eventData: jsonb('event_data').notNull(),
    consumerName: text('consumer_name').notNull(),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    firstFailedAt: timestamp('first_failed_at', { withTimezone: true }).notNull().defaultNow(),
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('failed'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_dead_letters_status').on(table.tenantId, table.status),
    index('idx_dead_letters_type').on(table.eventType, table.status),
    index('idx_dead_letters_consumer').on(table.consumerName, table.status),
    index('idx_dead_letters_created').on(table.createdAt),
  ],
);

// ── Tenant Settings ──────────────────────────────────────────────
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').references(() => locations.id),
    moduleKey: text('module_key').notNull(),
    settingKey: text('setting_key').notNull(),
    value: jsonb('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tenant_settings_lookup').on(
      table.tenantId,
      table.moduleKey,
      table.settingKey,
      table.locationId,
    ),
  ],
);

