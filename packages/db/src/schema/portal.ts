import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Portal Section Configs ──────────────────────────────────────

export const portalSectionConfigs = pgTable(
  'portal_section_configs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    portalType: text('portal_type').notNull(),
    identifier: text('identifier').notNull(),
    title: text('title').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    customFields: jsonb('custom_fields'),
    courseId: text('course_id'),
    svgIconUrl: text('svg_icon_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_portal_section_configs_tenant_type_ident').on(
      table.tenantId,
      table.portalType,
      table.identifier,
    ),
  ],
);

// ── Mobile App Configs ──────────────────────────────────────────

export const mobileAppConfigs = pgTable(
  'mobile_app_configs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    platform: text('platform').notNull(),
    appPackage: text('app_package'),
    fcmConfig: jsonb('fcm_config'),
    firebaseConfig: jsonb('firebase_config'),
    managementCompanyId: text('management_company_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_mobile_app_configs_tenant_platform').on(table.tenantId, table.platform),
  ],
);
