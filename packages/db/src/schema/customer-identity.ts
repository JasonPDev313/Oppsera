import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { customers } from './customers';

// ── Customer Emails ─────────────────────────────────────────────────
export const customerEmails = pgTable(
  'customer_emails',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    type: text('type').notNull().default('personal'), // personal | billing | spouse | corporate | other
    isPrimary: boolean('is_primary').notNull().default(false),
    isVerified: boolean('is_verified').notNull().default(false),
    canReceiveStatements: boolean('can_receive_statements').notNull().default(true),
    canReceiveMarketing: boolean('can_receive_marketing').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_emails_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_emails_normalized').on(table.tenantId, table.emailNormalized),
    uniqueIndex('uq_customer_emails_tenant_normalized').on(table.tenantId, table.emailNormalized),
  ],
);

// ── Customer Phones ─────────────────────────────────────────────────
export const customerPhones = pgTable(
  'customer_phones',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    phoneE164: text('phone_e164').notNull(),
    phoneDisplay: text('phone_display'),
    type: text('type').notNull().default('mobile'), // mobile | home | work | sms | other
    isPrimary: boolean('is_primary').notNull().default(false),
    isVerified: boolean('is_verified').notNull().default(false),
    canReceiveSms: boolean('can_receive_sms').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_phones_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_phones_e164').on(table.tenantId, table.phoneE164),
  ],
);

// ── Customer Addresses ──────────────────────────────────────────────
export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    type: text('type').notNull().default('mailing'), // mailing | billing | home | work | seasonal | other
    label: text('label'),
    line1: text('line1').notNull(),
    line2: text('line2'),
    line3: text('line3'),
    city: text('city').notNull(),
    state: text('state'),
    postalCode: text('postal_code'),
    county: text('county'),
    country: text('country').notNull().default('US'),
    isPrimary: boolean('is_primary').notNull().default(false),
    seasonalStartMonth: integer('seasonal_start_month'),
    seasonalEndMonth: integer('seasonal_end_month'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_addresses_tenant_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Customer Emergency Contacts ─────────────────────────────────────
export const customerEmergencyContacts = pgTable(
  'customer_emergency_contacts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    name: text('name').notNull(),
    relationship: text('relationship'),
    phoneE164: text('phone_e164').notNull(),
    phoneDisplay: text('phone_display'),
    email: text('email'),
    notes: text('notes'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_emergency_contacts_tenant_customer').on(
      table.tenantId,
      table.customerId,
    ),
  ],
);
