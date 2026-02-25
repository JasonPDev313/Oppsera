import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Tenant Business Info ─────────────────────────────────────────
export const tenantBusinessInfo = pgTable(
  'tenant_business_info',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Section 1: Business Information
    organizationName: text('organization_name'),
    timezone: text('timezone'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country').notNull().default('US'),
    primaryPhone: text('primary_phone'),
    primaryEmail: text('primary_email'),
    logoUrl: text('logo_url'),

    // Section 2: Operations
    accessType: text('access_type'),
    servicesOffered: jsonb('services_offered').notNull().default('[]'),
    productsOffered: jsonb('products_offered').notNull().default('[]'),
    rentalsAvailable: text('rentals_available'),
    foodAndBeverage: text('food_and_beverage'),
    promotionsDescription: text('promotions_description'),
    customerAccessPolicy: text('customer_access_policy'),

    // Section 3: Online Presence — Core Links
    websiteUrl: text('website_url'),
    bookingUrl: text('booking_url'),
    portalUrl: text('portal_url'),

    // Section 3: Online Presence — Social & Listings
    socialLinks: jsonb('social_links').notNull().default('{}'),

    // Section 5: Advanced — Contact Extensions
    secondaryPhone: text('secondary_phone'),
    supportEmail: text('support_email'),
    faxNumber: text('fax_number'),

    // Section 5: Advanced — Business Metadata
    industryType: text('industry_type'),
    businessHours: jsonb('business_hours').notNull().default('{}'),
    yearEstablished: integer('year_established'),
    taxIdEncrypted: text('tax_id_encrypted'),

    // Section 5: Advanced — Media
    photoGallery: jsonb('photo_gallery').notNull().default('[]'),
    promoVideoUrl: text('promo_video_url'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tenant_business_info_tenant').on(table.tenantId),
    index('idx_tenant_business_info_tenant').on(table.tenantId),
  ],
);

// ── Tenant Content Blocks ────────────────────────────────────────
export const tenantContentBlocks = pgTable(
  'tenant_content_blocks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    blockKey: text('block_key').notNull(),
    content: text('content').notNull().default(''),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tenant_content_blocks_key').on(table.tenantId, table.blockKey),
    index('idx_tenant_content_blocks_tenant').on(table.tenantId),
  ],
);
