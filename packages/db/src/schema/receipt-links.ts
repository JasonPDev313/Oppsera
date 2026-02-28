import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
  char,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ═══════════════════════════════════════════════════════════════════
// Receipt Public Links — Token-Based Digital Receipt Access
// ═══════════════════════════════════════════════════════════════════

// ── Receipt Public Links ─────────────────────────────────────────
// Each row maps a printed receipt QR code to a public, guest-facing
// digital receipt microsite. Token is 256-bit base64url (unguessable).

export const receiptPublicLinks = pgTable(
  'receipt_public_links',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id').notNull(),

    // Token: base64url 32 bytes (256-bit entropy), used in guest URL /r/{token}
    token: text('token').notNull(),

    // Lookup code: 6-char from ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0/O/1/I)
    lookupCode: char('lookup_code', { length: 6 }).notNull(),

    // Full receipt document snapshot (ReceiptDocument JSON)
    receiptDocumentSnapshot: jsonb('receipt_document_snapshot').notNull(),

    // Variant used to build this receipt
    variant: text('variant').notNull().default('standard'),

    // View tracking
    viewCount: integer('view_count').notNull().default(0),
    firstViewedAt: timestamp('first_viewed_at', { withTimezone: true }),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),

    // Expiry (null = never expires)
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_receipt_public_links_token').on(table.token),
    index('idx_receipt_public_links_tenant_order').on(
      table.tenantId,
      table.orderId,
    ),
    index('idx_receipt_public_links_expires').on(table.expiresAt),
  ],
);

// ── Receipt Emails ───────────────────────────────────────────────
// Log of emails sent for a digital receipt.

export const receiptEmails = pgTable(
  'receipt_emails',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    receiptLinkId: text('receipt_link_id')
      .notNull()
      .references(() => receiptPublicLinks.id),
    email: text('email').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    // sent | delivered | bounced
    status: text('status').notNull().default('sent'),
  },
  (table) => [
    index('idx_receipt_emails_tenant_link').on(
      table.tenantId,
      table.receiptLinkId,
    ),
  ],
);

// ── Receipt Loyalty Signups ──────────────────────────────────────
// Captures loyalty interest from the digital receipt microsite.

export const receiptLoyaltySignups = pgTable(
  'receipt_loyalty_signups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    receiptLinkId: text('receipt_link_id')
      .notNull()
      .references(() => receiptPublicLinks.id),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    optedInMarketing: boolean('opted_in_marketing').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_receipt_loyalty_signups_tenant_link').on(
      table.tenantId,
      table.receiptLinkId,
    ),
  ],
);
