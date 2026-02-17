import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customerActivityLog,
  customerIncidents,
  customerAlerts,
} from '@oppsera/db';

export interface GetCustomerNotesInput {
  tenantId: string;
  customerId: string;
}

export interface GetCustomerNotesResult {
  staffNotes: (typeof customerActivityLog.$inferSelect)[];
  incidents: (typeof customerIncidents.$inferSelect)[];
  alerts: (typeof customerAlerts.$inferSelect)[];
}

export async function getCustomerNotes(
  input: GetCustomerNotesInput,
): Promise<GetCustomerNotesResult> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch activity log entries where activityType='note' (newest first)
    const staffNotes = await tx
      .select()
      .from(customerActivityLog)
      .where(
        and(
          eq(customerActivityLog.tenantId, input.tenantId),
          eq(customerActivityLog.customerId, input.customerId),
          eq(customerActivityLog.activityType, 'note'),
        ),
      )
      .orderBy(desc(customerActivityLog.createdAt));

    // Fetch incidents (all, newest first)
    const incidents = await tx
      .select()
      .from(customerIncidents)
      .where(
        and(
          eq(customerIncidents.tenantId, input.tenantId),
          eq(customerIncidents.customerId, input.customerId),
        ),
      )
      .orderBy(desc(customerIncidents.createdAt));

    // Fetch all alerts (active + dismissed)
    const alerts = await tx
      .select()
      .from(customerAlerts)
      .where(
        and(
          eq(customerAlerts.tenantId, input.tenantId),
          eq(customerAlerts.customerId, input.customerId),
        ),
      )
      .orderBy(desc(customerAlerts.createdAt));

    return { staffNotes, incidents, alerts };
  });
}
