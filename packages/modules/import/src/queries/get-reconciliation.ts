/**
 * Get reconciliation totals for an import job.
 */

import { eq, and } from 'drizzle-orm';
import { withTenant, importJobs } from '@oppsera/db';

export async function getReconciliation(tenantId: string, importJobId: string) {
  return withTenant(tenantId, async (tx) => {
    const [job] = await tx
      .select({
        legacyRevenueCents: importJobs.legacyRevenueCents,
        legacyPaymentCents: importJobs.legacyPaymentCents,
        legacyTaxCents: importJobs.legacyTaxCents,
        legacyRowCount: importJobs.legacyRowCount,
        oppseraRevenueCents: importJobs.oppseraRevenueCents,
        oppseraPaymentCents: importJobs.oppseraPaymentCents,
        oppseraTaxCents: importJobs.oppseraTaxCents,
        oppseraOrderCount: importJobs.oppseraOrderCount,
      })
      .from(importJobs)
      .where(
        and(
          eq(importJobs.id, importJobId),
          eq(importJobs.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!job) return null;

    const revenueDifference = Math.abs((job.legacyRevenueCents ?? 0) - (job.oppseraRevenueCents ?? 0));
    const paymentDifference = Math.abs((job.legacyPaymentCents ?? 0) - (job.oppseraPaymentCents ?? 0));
    const taxDifference = Math.abs((job.legacyTaxCents ?? 0) - (job.oppseraTaxCents ?? 0));

    return {
      ...job,
      revenueDifferenceCents: revenueDifference,
      paymentDifferenceCents: paymentDifference,
      taxDifferenceCents: taxDifference,
      isBalanced: revenueDifference < 100 && paymentDifference < 100 && taxDifference < 100,
    };
  });
}
