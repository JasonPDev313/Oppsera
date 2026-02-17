import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tenders, tenderReversals } from '@oppsera/db';

type Tender = typeof tenders.$inferSelect;
type TenderReversal = typeof tenderReversals.$inferSelect;

export interface TenderWithReversals extends Tender {
  reversals: TenderReversal[];
  isReversed: boolean;
  effectiveStatus: 'captured' | 'reversed';
}

export interface TenderSummary {
  tenders: TenderWithReversals[];
  summary: {
    totalTendered: number;
    totalTips: number;
    totalChangeGiven: number;
    remainingBalance: number;
    isFullyPaid: boolean;
  };
}

export async function getTendersByOrder(tenantId: string, orderId: string, orderTotal: number): Promise<TenderSummary> {
  return withTenant(tenantId, async (tx) => {
    const allTenders = await tx.select().from(tenders).where(
      and(eq(tenders.tenantId, tenantId), eq(tenders.orderId, orderId)),
    );

    const allReversals = await tx.select().from(tenderReversals).where(
      and(eq(tenderReversals.tenantId, tenantId), eq(tenderReversals.orderId, orderId)),
    );

    // Group reversals by original tender
    const reversalsByTender = new Map<string, TenderReversal[]>();
    for (const r of allReversals) {
      const existing = reversalsByTender.get(r.originalTenderId) || [];
      existing.push(r);
      reversalsByTender.set(r.originalTenderId, existing);
    }

    // Build enriched tender list
    const enrichedTenders: TenderWithReversals[] = allTenders.map(t => {
      const reversals = reversalsByTender.get(t.id) || [];
      const isReversed = reversals.some(r => r.status === 'completed');
      return {
        ...t,
        reversals,
        isReversed,
        effectiveStatus: isReversed ? 'reversed' as const : 'captured' as const,
      };
    });

    // Compute summary (exclude reversed)
    const activeTenders = enrichedTenders.filter(t => !t.isReversed && t.status === 'captured');
    const totalTendered = activeTenders.reduce((sum, t) => sum + t.amount, 0);
    const totalTips = activeTenders.reduce((sum, t) => sum + t.tipAmount, 0);
    const totalChangeGiven = activeTenders.reduce((sum, t) => sum + t.changeGiven, 0);
    const remainingBalance = Math.max(0, orderTotal - totalTendered);
    const isFullyPaid = totalTendered >= orderTotal;

    return {
      tenders: enrichedTenders,
      summary: { totalTendered, totalTips, totalChangeGiven, remainingBalance, isFullyPaid },
    };
  });
}
