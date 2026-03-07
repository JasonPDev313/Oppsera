import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const journalPostedSchema = z.object({
  journalEntryId: z.string(),
  journalNumber: z.number(),
  sourceModule: z.string(),
  sourceReferenceId: z.string().nullish(),
  businessDate: z.string(),
  totalAmount: z.number(),
  lineCount: z.number(),
});

const CONSUMER_NAME = 'reporting.glJournalRevenue';

// Source modules whose GL entries are already tracked via their own
// revenue consumers (order.placed, folio.charge_posted, etc.).
// Skip these to prevent double-counting in rm_revenue_activity.
const SKIP_SOURCE_MODULES = new Set([
  'pos', 'orders', 'tenders', 'pms', 'spa', 'ar', 'membership', 'voucher',
  'fnb', 'chargeback', 'stored_value', 'inventory',
]);

/**
 * Handles accounting.journal.posted.v1 events for sales history.
 *
 * When a manual GL journal entry credits revenue accounts, it should
 * appear in the unified sales history (rm_revenue_activity) so the
 * business owner can see all revenue sources.
 *
 * Skips automated GL entries (from POS, PMS, Spa, etc.) which already
 * have their own rm_revenue_activity rows via dedicated consumers.
 */
export async function handleGlJournalRevenue(event: EventEnvelope): Promise<void> {
  const parsed = journalPostedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;

  // Skip automated GL entries — they already have rm_revenue_activity rows
  if (SKIP_SOURCE_MODULES.has(data.sourceModule)) return;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Idempotency
    const inserted = await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<Iterable<{ id: string }>> }).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted);
    if (rows.length === 0) return;

    // Step 2: Query journal lines that credit revenue accounts
    const revenueLines = await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<Iterable<Record<string, unknown>>> }).execute(sql`
      SELECT
        jl.credit_amount,
        jl.debit_amount,
        ga.name AS account_name,
        ga.account_number,
        je.description AS memo
      FROM gl_journal_lines jl
      JOIN gl_accounts ga ON ga.id = jl.account_id AND ga.tenant_id = jl.tenant_id
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id AND je.tenant_id = jl.tenant_id
      WHERE jl.tenant_id = ${event.tenantId}
        AND jl.journal_entry_id = ${data.journalEntryId}
        AND ga.account_type = 'revenue'
        AND jl.credit_amount > 0
    `);

    const revLines = Array.from(revenueLines);
    if (revLines.length === 0) return; // No revenue impact — skip

    // Step 3: Sum up revenue credits
    let totalRevenueDollars = 0;
    const accountNames: string[] = [];
    for (const line of revLines) {
      totalRevenueDollars += Number(line.credit_amount) - Number(line.debit_amount || 0);
      const acctName = String(line.account_name ?? '');
      if (acctName && !accountNames.includes(acctName)) {
        accountNames.push(acctName);
      }
    }

    if (totalRevenueDollars <= 0) return; // Net debit to revenue = not revenue-adding

    const memo = revLines[0]?.memo ? String(revLines[0].memo) : null;
    const sourceLabel = memo
      ? `GL #${data.journalNumber} — ${memo}`
      : `GL Journal #${data.journalNumber}`;
    const locationId = event.locationId || '';

    // Step 4: Insert rm_revenue_activity
    await (tx as unknown as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(sql`
      INSERT INTO rm_revenue_activity (
        id, tenant_id, location_id, business_date,
        source, source_sub_type, source_id, source_label,
        reference_number,
        amount_dollars, subtotal_dollars,
        status, metadata, occurred_at, created_at
      )
      VALUES (
        ${generateUlid()}, ${event.tenantId}, ${locationId}, ${data.businessDate},
        ${'gl_adjustment'}, ${data.sourceModule}, ${data.journalEntryId}, ${sourceLabel},
        ${String(data.journalNumber)},
        ${totalRevenueDollars}, ${totalRevenueDollars},
        ${'completed'}, ${JSON.stringify({ accounts: accountNames, lineCount: revLines.length })},
        ${event.occurredAt}::timestamptz, NOW()
      )
      ON CONFLICT (tenant_id, source, source_id) DO UPDATE SET
        amount_dollars = ${totalRevenueDollars},
        subtotal_dollars = ${totalRevenueDollars},
        source_label = ${sourceLabel},
        status = ${'completed'},
        occurred_at = ${event.occurredAt}::timestamptz
    `);
  });
}
