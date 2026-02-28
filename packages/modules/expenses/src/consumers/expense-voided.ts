import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const expenseVoidedSchema = z.object({
  expenseId: z.string(),
  amount: z.number(),
  category: z.string(),
  locationId: z.string().nullable().optional(),
  reason: z.string(),
});

const CONSUMER_NAME = 'expenses.expenseVoided';

/**
 * Handles expense.voided.v1 events.
 *
 * Atomically (single transaction):
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency guard)
 * 3. Upsert rm_expense_summary: decrement expenseCount + totalAmount
 */
export async function handleExpenseVoided(event: EventEnvelope): Promise<void> {
  const parsed = expenseVoidedSchema.safeParse(event.data);
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

    // Step 3: Decrement rm_expense_summary
    await (tx as any).execute(sql`
      UPDATE rm_expense_summary
      SET
        expense_count = GREATEST(rm_expense_summary.expense_count - 1, 0),
        total_amount = GREATEST(rm_expense_summary.total_amount - ${amount}, 0),
        updated_at = NOW()
      WHERE tenant_id = ${event.tenantId}
        AND COALESCE(location_id, '') = COALESCE(${locationId}::text, '')
        AND fiscal_period = ${fiscalPeriod}
        AND category = ${data.category}
    `);
  });
}
