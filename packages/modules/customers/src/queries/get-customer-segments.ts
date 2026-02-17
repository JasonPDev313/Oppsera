import { eq, and, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customerSegments,
  customerSegmentMemberships,
} from '@oppsera/db';

export interface GetCustomerSegmentsInput {
  tenantId: string;
  customerId: string;
}

export interface CustomerSegmentEntry {
  membership: typeof customerSegmentMemberships.$inferSelect;
  segmentName: string;
  segmentType: string;
}

export async function getCustomerSegments(
  input: GetCustomerSegmentsInput,
): Promise<CustomerSegmentEntry[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select({
        membership: customerSegmentMemberships,
        segmentName: customerSegments.name,
        segmentType: customerSegments.segmentType,
      })
      .from(customerSegmentMemberships)
      .innerJoin(
        customerSegments,
        eq(customerSegmentMemberships.segmentId, customerSegments.id),
      )
      .where(
        and(
          eq(customerSegmentMemberships.tenantId, input.tenantId),
          eq(customerSegmentMemberships.customerId, input.customerId),
          isNull(customerSegmentMemberships.removedAt),
        ),
      );

    return rows.map((row) => ({
      membership: row.membership,
      segmentName: row.segmentName,
      segmentType: row.segmentType,
    }));
  });
}
