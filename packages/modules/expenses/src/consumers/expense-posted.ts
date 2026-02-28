import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const expensePostedSchema = z.object({
  expenseId: z.string(),
  amount: z.number(),
  category: z.string(),
  locationId: z.string().nullable().optional(),
  employeeUserId: z.string(),
  glJournalEntryId: z.string().nullable().optional(),
});

const CONSUMER_NAME = 'expenses.expensePosted';

/**
 * Handles expense.posted.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_expense_summary: increment expenseCount + totalAmount
 */
export async function handleExpensePosted(event: EventEnvelope): Promise<void> {
  const parsed = expensePostedSchema.safeParse(event.data);
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

    // Step 2: Compute fiscal period (YYYY-MM from event timestamp)
    const occurredAt = event.occurredAt ?? new Date().toISOString();
    const fiscalPeriod = occurredAt.slice(0, 7); // YYYY-MM
    const locationId = data.locationId ?? null;
    const amount = data.amount; // already in dollars (NUMERIC(12,2))

    // Step 3: Upsert rm_expense_summary
    await (tx as any).execute(sql`
      INSERT INTO rm_expense_summary (
        id, tenant_id, location_id, fiscal_period, category,
        expense_count, total_amount,
        reimbursed_count, reimbursed_amount,
        pending_count, pending_amount,
        created_at, updated_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${fiscalPeriod}, ${data.category},
        1, ${amount},
        0, 0,
        0, 0,
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, location_id, fiscal_period, category)
      DO UPDATE SET
        expense_count = rm_expense_summary.expense_count + 1,
        total_amount = rm_expense_summary.total_amount + ${amount},
        updated_at = NOW()
    `);
  });
}
