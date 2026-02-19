import {
  pgTable,
  text,
  boolean,
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
  (table) => [index('idx_locations_tenant').on(table.tenantId)],
);

// ── Users ────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  authProviderId: text('auth_provider_id').unique(),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),

  // ── Employee fields (migration 0031) ──
  phone: text('phone'),
  posPin: text('pos_pin'),
  overridePin: text('override_pin'),
  employeeColor: text('employee_color'),
  externalPayrollId: text('external_payroll_id'),
  profileImageUrl: text('profile_image_url'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  (table) => [index('idx_role_assignments_user').on(table.tenantId, table.userId)],
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
    limits: jsonb('limits').notNull().default('{}'),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_entitlements_tenant_module').on(table.tenantId, table.moduleKey),
  ],
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
