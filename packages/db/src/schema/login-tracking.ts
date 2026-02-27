import {
  pgTable,
  text,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, users } from './core';
import { platformAdmins } from './platform';

// ── Login Records (tenant users, append-only, RLS) ─────────────

export const loginRecords = pgTable(
  'login_records',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id').references(() => users.id),
    email: text('email').notNull(),
    outcome: text('outcome').notNull(), // 'success' | 'failed' | 'locked'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    geoCity: text('geo_city'),
    geoRegion: text('geo_region'),
    geoCountry: text('geo_country'),
    geoLatitude: numeric('geo_latitude', { precision: 10, scale: 7 }),
    geoLongitude: numeric('geo_longitude', { precision: 10, scale: 7 }),
    terminalId: text('terminal_id'),
    terminalName: text('terminal_name'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_login_records_tenant_user').on(table.tenantId, table.userId, table.createdAt),
    index('idx_login_records_tenant_created').on(table.tenantId, table.createdAt),
  ],
);

// ── Admin Login Records (platform admins, NO RLS) ───────────────

export const adminLoginRecords = pgTable(
  'admin_login_records',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    adminId: text('admin_id').references(() => platformAdmins.id),
    email: text('email').notNull(),
    outcome: text('outcome').notNull(), // 'success' | 'failed'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    geoCity: text('geo_city'),
    geoRegion: text('geo_region'),
    geoCountry: text('geo_country'),
    geoLatitude: numeric('geo_latitude', { precision: 10, scale: 7 }),
    geoLongitude: numeric('geo_longitude', { precision: 10, scale: 7 }),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_admin_login_records_admin_created').on(table.adminId, table.createdAt),
    index('idx_admin_login_records_email_created').on(table.email, table.createdAt),
  ],
);
