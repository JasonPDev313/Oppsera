import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

interface LegacyEntry {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

interface MigrationResult {
  totalProcessed: number;
  skipped: number;
  failed: number;
  created: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Migrate legacy payment_journal_entries to proper GL journal entries.
 * Idempotent: entries already migrated (by sourceReferenceId) are skipped.
 * Process in batches to avoid long transactions.
 */
export async function migrateLegacyJournalEntries(
  tenantId: string,
  batchSize = 100,
): Promise<MigrationResult> {
  const accountingApi = getAccountingPostingApi();
  const result: MigrationResult = {
    totalProcessed: 0,
    skipped: 0,
    failed: 0,
    created: 0,
    errors: [],
  };

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const rows = await db.execute(sql`
      SELECT id, tenant_id, location_id, reference_type, reference_id,
             order_id, entries, business_date, source_module
      FROM payment_journal_entries
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      OFFSET ${offset}
    `);

    const batch = Array.from(rows as Iterable<Record<string, unknown>>);
    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    for (const row of batch) {
      result.totalProcessed++;

      try {
        const entries = (row.entries as LegacyEntry[]) ?? [];
        if (entries.length === 0) {
          result.skipped++;
          continue;
        }

        // Build GL lines from legacy JSONB entries
        // Legacy entries have { accountCode, accountName, debit, credit }
        // We need to look up accountId by accountCode
        const glLines: Array<{
          accountId: string;
          debitAmount: string;
          creditAmount: string;
          locationId?: string;
          memo?: string;
        }> = [];

        let skipEntry = false;
        for (const entry of entries) {
          // Resolve account by code
          const accountRows = await db.execute(sql`
            SELECT id FROM gl_accounts
            WHERE tenant_id = ${tenantId}
              AND account_number = ${entry.accountCode}
              AND is_active = true
            LIMIT 1
          `);

          const accounts = Array.from(accountRows as Iterable<Record<string, unknown>>);
          if (accounts.length === 0) {
            result.failed++;
            result.errors.push({
              id: String(row.id),
              error: `Account not found: ${entry.accountCode} (${entry.accountName})`,
            });
            skipEntry = true;
            break;
          }

          glLines.push({
            accountId: String(accounts[0]!.id),
            debitAmount: (entry.debit ?? 0).toFixed(2),
            creditAmount: (entry.credit ?? 0).toFixed(2),
            locationId: row.location_id ? String(row.location_id) : undefined,
            memo: entry.accountName,
          });
        }

        if (skipEntry) continue;

        // Post via accounting API — idempotent via unique index on (tenantId, sourceModule, sourceReferenceId)
        const ctx: RequestContext = {
          tenantId,
          locationId: row.location_id ? String(row.location_id) : undefined,
          user: { id: 'system', email: 'system@oppsera.io', name: 'System (Legacy Migration)', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
          requestId: `legacy-migrate-${String(row.id)}`,
          isPlatformAdmin: false,
        } as RequestContext;

        await accountingApi.postEntry(ctx, {
          businessDate: String(row.business_date),
          sourceModule: 'pos_legacy',
          sourceReferenceId: String(row.id),
          memo: `Legacy POS ${String(row.reference_type)} - Order ${String(row.order_id)}`,
          currency: 'USD',
          lines: glLines,
          forcePost: true,
        });

        result.created++;
      } catch (error) {
        // If it's an idempotency collision, count as skipped
        const errMsg = error instanceof Error ? error.message : 'Unknown';
        if (errMsg.includes('duplicate') || errMsg.includes('unique')) {
          result.skipped++;
        } else {
          result.failed++;
          result.errors.push({ id: String(row.id), error: errMsg });
        }
      }
    }

    offset += batchSize;
    if (batch.length < batchSize) hasMore = false;
  }

  return result;
}
