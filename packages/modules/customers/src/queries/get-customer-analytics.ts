import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customerScores,
  customerMetricsLifetime,
} from '@oppsera/db';

export interface GetCustomerAnalyticsInput {
  tenantId: string;
  customerId: string;
}

export interface GetCustomerAnalyticsResult {
  scores: (typeof customerScores.$inferSelect)[];
  metrics: (typeof customerMetricsLifetime.$inferSelect) | null;
}

export async function getCustomerAnalytics(
  input: GetCustomerAnalyticsInput,
): Promise<GetCustomerAnalyticsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const scores = await tx
      .select()
      .from(customerScores)
      .where(
        and(
          eq(customerScores.tenantId, input.tenantId),
          eq(customerScores.customerId, input.customerId),
        ),
      );

    const [metrics] = await tx
      .select()
      .from(customerMetricsLifetime)
      .where(
        and(
          eq(customerMetricsLifetime.tenantId, input.tenantId),
          eq(customerMetricsLifetime.customerId, input.customerId),
        ),
      )
      .limit(1);

    return {
      scores,
      metrics: metrics ?? null,
    };
  });
}
