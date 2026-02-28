import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const expenseReimbursedSchema = z.object({
  expenseId: z.string(),
  amount: z.number(),
  category: z.string(),
  locationId: z.string().nullable().optional(),
  method: z.string(),
  reference: z.string().optional(),
});

const CONSUMER_NAME = 'expenses.expenseReimbursed';

/**
 * Handles expense.reimbursed.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_expense_summary: increment reimbursedCount + reimbursedAmount
 */
export async function handleExpenseReimbursed(event: EventEnvelope): Promise<void> {
  const parsed = expenseReimbursedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return; // Already processed

    // Step 2: Compute fiscal period
    const occurredAt = event.occurredAt ?? new Date().toISOString();
    const fiscalPeriod = occurredAt.slice(0, 7); // YYYY-MM
    const locationId = data.locationId ?? null;
    const amount = data.amount; // dollars

    // Step 3: Increment reimbursed counters in rm_expense_summary
    await (tx as any).execute(sql`
      UPDATE rm_expense_summary
      SET
        reimbursed_count = rm_expense_summary.reimbursed_count + 1,
        reimbursed_amount = rm_expense_summary.reimbursed_amount + ${amount},
        updated_at = NOW()
      WHERE tenant_id = ${event.tenantId}
        AND COALESCE(location_id, '') = COALESCE(${locationId}::text, '')
        AND fiscal_period = ${fiscalPeriod}
        AND category = ${data.category}
    `);
  });
}
