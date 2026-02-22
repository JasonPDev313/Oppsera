import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant, pendingBreakageReview } from '@oppsera/db';
import type { BreakageReviewItem } from '../commands/review-breakage';

export interface ListPendingBreakageInput {
  tenantId: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

function mapRow(row: typeof pendingBreakageReview.$inferSelect): BreakageReviewItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    voucherId: row.voucherId,
    voucherNumber: row.voucherNumber,
    amountCents: row.amountCents,
    expiredAt: row.expiredAt.toISOString(),
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNotes: row.reviewNotes,
    glJournalEntryId: row.glJournalEntryId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPendingBreakage(
  input: ListPendingBreakageInput,
): Promise<{ items: BreakageReviewItem[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(pendingBreakageReview.tenantId, input.tenantId)];

    if (input.status) {
      conditions.push(eq(pendingBreakageReview.status, input.status));
    }
    if (input.cursor) {
      conditions.push(sql`${pendingBreakageReview.id} < ${input.cursor}`);
    }

    const rows = await tx
      .select()
      .from(pendingBreakageReview)
      .where(and(...conditions))
      .orderBy(desc(pendingBreakageReview.createdAt), desc(pendingBreakageReview.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map(mapRow),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

export async function getPendingBreakageStats(
  tenantId: string,
): Promise<{ pendingCount: number; pendingAmountCents: number }> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pendingBreakageReview)
      .where(
        and(
          eq(pendingBreakageReview.tenantId, tenantId),
          eq(pendingBreakageReview.status, 'pending'),
        ),
      );

    let totalCents = 0;
    for (const row of rows) {
      totalCents += row.amountCents;
    }

    return {
      pendingCount: rows.length,
      pendingAmountCents: totalCents,
    };
  });
}
