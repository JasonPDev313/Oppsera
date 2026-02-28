import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const glEntryPostedSchema = z.object({
  journalEntryId: z.string(),
  entryDate: z.string(),
  lines: z.array(z.object({
    accountId: z.string(),
    accountType: z.string().optional(),
    debitAmount: z.string(),
    creditAmount: z.string(),
    projectId: z.string().nullable().optional(),
    projectTaskId: z.string().nullable().optional(),
  })),
});

const CONSUMER_NAME = 'projectCosting.glEntryPosted';

/**
 * Handles `accounting.journal.posted.v1` events.
 * When a GL entry has projectId on any line, upsert rm_project_cost_summary
 * by classifying the account type (revenue/expense/labor/material).
 */
export async function handleGlEntryPostedForProjectCost(
  event: EventEnvelope,
): Promise<void> {
  const parsed = glEntryPostedSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return;
  }
  const data = parsed.data;
  const tenantId = event.tenantId;
  const entryDate = data.entryDate;

  // Extract lines that have a projectId
  const projectLines = data.lines.filter((l) => l.projectId);
  if (projectLines.length === 0) return;

  // Derive fiscal period from entry date (YYYY-MM)
  const fiscalPeriod = entryDate.slice(0, 7);

  // Group by projectId
  const byProject = new Map<
    string,
    { revenue: number; directCost: number; laborCost: number; materialCost: number; otherCost: number }
  >();

  for (const line of projectLines) {
    const pid = line.projectId!;
    if (!byProject.has(pid)) {
      byProject.set(pid, { revenue: 0, directCost: 0, laborCost: 0, materialCost: 0, otherCost: 0 });
    }
    const bucket = byProject.get(pid)!;
    const netAmount = Number(line.debitAmount) - Number(line.creditAmount);
    const accountType = (line.accountType ?? '').toLowerCase();

    if (accountType === 'revenue') {
      // Revenue is credit-normal, so net debit-credit is negative for revenue
      bucket.revenue += -netAmount;
    } else if (accountType === 'expense') {
      bucket.directCost += netAmount;
      // Classify expense sub-types if we can identify them
      bucket.otherCost += netAmount;
    } else if (accountType === 'asset') {
      // Material / inventory purchases
      bucket.materialCost += netAmount;
      bucket.directCost += netAmount;
    } else {
      bucket.otherCost += netAmount;
      bucket.directCost += netAmount;
    }
  }

  await withTenant(tenantId, async (tx) => {
    for (const [projectId, amounts] of byProject) {
      const grossMargin = amounts.revenue - amounts.directCost;

      await tx.execute(sql`
        INSERT INTO rm_project_cost_summary (
          id, tenant_id, project_id, fiscal_period,
          revenue_amount, direct_cost_amount,
          labor_hours, labor_cost, material_cost, other_cost,
          gross_margin, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${tenantId}, ${projectId}, ${fiscalPeriod},
          ${amounts.revenue.toFixed(4)}, ${amounts.directCost.toFixed(4)},
          0, 0,
          ${amounts.materialCost.toFixed(4)}, ${amounts.otherCost.toFixed(4)},
          ${grossMargin.toFixed(4)}, NOW(), NOW()
        )
        ON CONFLICT (tenant_id, project_id, fiscal_period) DO UPDATE SET
          revenue_amount = rm_project_cost_summary.revenue_amount + EXCLUDED.revenue_amount,
          direct_cost_amount = rm_project_cost_summary.direct_cost_amount + EXCLUDED.direct_cost_amount,
          material_cost = rm_project_cost_summary.material_cost + EXCLUDED.material_cost,
          other_cost = rm_project_cost_summary.other_cost + EXCLUDED.other_cost,
          gross_margin = (rm_project_cost_summary.revenue_amount + EXCLUDED.revenue_amount)
            - (rm_project_cost_summary.direct_cost_amount + EXCLUDED.direct_cost_amount),
          updated_at = NOW()
      `);
    }
  });
}
