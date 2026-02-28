import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Intercompany GL Account Pairs ────────────────────────────────
// Maps paired AR/AP and elimination accounts between two legal entities
// Used for consolidated reporting — no elimination engine in V1
export const intercompanyGlAccountPairs = pgTable(
  'intercompany_gl_account_pairs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entityALocationId: text('entity_a_location_id')
      .notNull()
      .references(() => locations.id),
    entityBLocationId: text('entity_b_location_id')
      .notNull()
      .references(() => locations.id),
    arAccountId: text('ar_account_id'), // soft ref to gl_accounts.id
    apAccountId: text('ap_account_id'), // soft ref to gl_accounts.id
    revenueEliminationAccountId: text('revenue_elimination_account_id'), // soft ref to gl_accounts.id
    expenseEliminationAccountId: text('expense_elimination_account_id'), // soft ref to gl_accounts.id
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: text('archived_by'),
    archivedReason: text('archived_reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_intercompany_pairs_tenant').on(table.tenantId),
    uniqueIndex('uq_intercompany_pairs_entities')
      .on(table.tenantId, table.entityALocationId, table.entityBLocationId)
      .where(sql`archived_at IS NULL`),
    index('idx_intercompany_pairs_entity_a').on(table.tenantId, table.entityALocationId),
    index('idx_intercompany_pairs_entity_b').on(table.tenantId, table.entityBLocationId),
    check(
      'chk_intercompany_different_entities',
      sql`entity_a_location_id <> entity_b_location_id`,
    ),
  ],
);
