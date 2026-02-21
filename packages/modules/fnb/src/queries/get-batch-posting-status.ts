import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetBatchPostingStatusInput } from '../validation';

export interface BatchPostingStatus {
  closeBatchId: string;
  batchStatus: string;
  glJournalEntryId: string | null;
  postedAt: string | null;
  postedBy: string | null;
  isPosted: boolean;
}

export async function getBatchPostingStatus(
  input: GetBatchPostingStatusInput,
): Promise<BatchPostingStatus | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, status, gl_journal_entry_id, posted_at, posted_by
          FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${input.tenantId}`,
    );
    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      closeBatchId: r.id as string,
      batchStatus: r.status as string,
      glJournalEntryId: (r.gl_journal_entry_id as string) ?? null,
      postedAt: (r.posted_at as string) ?? null,
      postedBy: (r.posted_by as string) ?? null,
      isPosted: r.gl_journal_entry_id != null,
    };
  });
}
