import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

// ── Distributed Locks (infrastructure, no RLS) ──────────────

export const distributedLocks = pgTable('distributed_locks', {
  lockKey: text('lock_key').primaryKey().notNull(),
  holderId: text('holder_id').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
}, (table) => [
  index('idx_distributed_locks_expires').on(table.expiresAt),
]);
