import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetCloseBatchInput } from '../validation';

export interface CloseBatchDetail {
  id: string;
  locationId: string;
  businessDate: string;
  status: string;
  startedAt: string | null;
  startedBy: string | null;
  reconciledAt: string | null;
  reconciledBy: string | null;
  postedAt: string | null;
  postedBy: string | null;
  lockedAt: string | null;
  glJournalEntryId: string | null;
  notes: string | null;
}

export async function getCloseBatch(
  input: GetCloseBatchInput,
): Promise<CloseBatchDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, location_id, business_date, status,
                 started_at, started_by, reconciled_at, reconciled_by,
                 posted_at, posted_by, locked_at, gl_journal_entry_id, notes
          FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${input.tenantId}`,
    );
    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      id: r.id as string,
      locationId: r.location_id as string,
      businessDate: r.business_date as string,
      status: r.status as string,
      startedAt: (r.started_at as string) ?? null,
      startedBy: (r.started_by as string) ?? null,
      reconciledAt: (r.reconciled_at as string) ?? null,
      reconciledBy: (r.reconciled_by as string) ?? null,
      postedAt: (r.posted_at as string) ?? null,
      postedBy: (r.posted_by as string) ?? null,
      lockedAt: (r.locked_at as string) ?? null,
      glJournalEntryId: (r.gl_journal_entry_id as string) ?? null,
      notes: (r.notes as string) ?? null,
    };
  });
}
