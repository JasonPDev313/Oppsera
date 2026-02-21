import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';

// ── Platform Admins ──────────────────────────────────────────────
// NOT tenant-scoped — these are OppsEra internal operators.
// No RLS on this table.

export const platformAdmins = pgTable('platform_admins', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  // role: 'super_admin' | 'admin' | 'viewer'
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
