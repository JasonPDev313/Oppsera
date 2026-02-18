import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerActivityLog, customerVisits } from '@oppsera/db';

export interface GetCustomerActivityInput {
  tenantId: string;
  customerId: string;
  cursor?: string;
  limit?: number;
}

export interface GetCustomerActivityResult {
  timeline: (typeof customerActivityLog.$inferSelect)[];
  recentVisits: (typeof customerVisits.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getCustomerActivity(
  input: GetCustomerActivityInput,
): Promise<GetCustomerActivityResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    // Fetch activity log, paginated by cursor on id
    const conditions = [
      eq(customerActivityLog.tenantId, input.tenantId),
      eq(customerActivityLog.customerId, input.customerId),
    ];

    if (input.cursor) {
      conditions.push(lt(customerActivityLog.id, input.cursor));
    }

    const [rows, recentVisits] = await Promise.all([
      tx
        .select()
        .from(customerActivityLog)
        .where(and(...conditions))
        .orderBy(desc(customerActivityLog.id))
        .limit(limit + 1),
      tx
        .select()
        .from(customerVisits)
        .where(
          and(
            eq(customerVisits.tenantId, input.tenantId),
            eq(customerVisits.customerId, input.customerId),
          ),
        )
        .orderBy(desc(customerVisits.checkInAt))
        .limit(20),
    ]);

    const hasMore = rows.length > limit;
    const timeline = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? timeline[timeline.length - 1]!.id : null;

    return { timeline, recentVisits, cursor: nextCursor, hasMore };
  });
}
