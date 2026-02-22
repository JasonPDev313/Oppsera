import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface TenderAuditTrailStep {
  stage: string;
  label: string;
  status: 'complete' | 'pending' | 'missing';
  timestamp: string | null;
  referenceId: string | null;
  detail?: string;
}

export interface TenderAuditTrail {
  tenderId: string;
  tenderType: string;
  amountCents: number;
  tipAmountCents: number;
  orderId: string;
  orderNumber: string | null;
  businessDate: string;
  locationId: string;
  employeeId: string | null;
  steps: TenderAuditTrailStep[];
}

/**
 * Full lifecycle of a tender: tender → GL → settlement → deposit.
 * Returns a vertical timeline of steps.
 */
export async function getTenderAuditTrail(input: {
  tenantId: string;
  tenderId: string;
}): Promise<TenderAuditTrail | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Get the tender
    const tenderRows = await tx.execute(sql`
      SELECT
        t.id, t.tender_type, t.amount, t.tip_amount, t.order_id,
        t.business_date::text, t.location_id, t.employee_id, t.status,
        t.created_at::text
      FROM tenders t
      WHERE t.id = ${input.tenderId}
        AND t.tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const tenderArr = Array.from(tenderRows as Iterable<Record<string, unknown>>);
    if (tenderArr.length === 0) return null;

    const tender = tenderArr[0]!;
    const steps: TenderAuditTrailStep[] = [];

    // Step 1: Tender recorded
    steps.push({
      stage: 'tender',
      label: 'Tender Recorded',
      status: 'complete',
      timestamp: String(tender.created_at),
      referenceId: String(tender.id),
      detail: `${String(tender.tender_type)} — $${(Number(tender.amount) / 100).toFixed(2)}`,
    });

    // Step 2: Order info
    const orderRows = await tx.execute(sql`
      SELECT o.order_number, o.status, o.placed_at::text, o.paid_at::text
      FROM orders o
      WHERE o.id = ${String(tender.order_id)}
        AND o.tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const orderArr = Array.from(orderRows as Iterable<Record<string, unknown>>);
    const order = orderArr.length > 0 ? orderArr[0]! : null;

    steps.push({
      stage: 'order',
      label: 'Order Paid',
      status: order && order.paid_at ? 'complete' : 'pending',
      timestamp: order?.paid_at ? String(order.paid_at) : null,
      referenceId: String(tender.order_id),
      detail: order ? `Order #${String(order.order_number)} — ${String(order.status)}` : undefined,
    });

    // Step 3: GL posting
    const glRows = await tx.execute(sql`
      SELECT je.id, je.status, je.posted_at::text, je.journal_number, je.memo
      FROM gl_journal_entries je
      WHERE je.tenant_id = ${input.tenantId}
        AND je.source_module = 'pos'
        AND je.source_reference_id = ${input.tenderId}
      LIMIT 1
    `);
    const glArr = Array.from(glRows as Iterable<Record<string, unknown>>);
    const glEntry = glArr.length > 0 ? glArr[0]! : null;

    steps.push({
      stage: 'gl_posting',
      label: 'GL Posted',
      status: glEntry && glEntry.status === 'posted' ? 'complete' : glEntry ? 'pending' : 'missing',
      timestamp: glEntry?.posted_at ? String(glEntry.posted_at) : null,
      referenceId: glEntry ? String(glEntry.id) : null,
      detail: glEntry ? `JE #${String(glEntry.journal_number)}` : 'No GL entry found',
    });

    // Step 4: Settlement match (for card tenders)
    if (String(tender.tender_type) !== 'cash') {
      const settlementRows = await tx.execute(sql`
        SELECT
          psl.id AS line_id,
          ps.id AS settlement_id,
          ps.processor_name,
          ps.settlement_date::text,
          ps.status AS settlement_status,
          psl.status AS line_status,
          psl.matched_at::text,
          psl.fee_cents
        FROM payment_settlement_lines psl
        JOIN payment_settlements ps ON ps.id = psl.settlement_id
        WHERE psl.tender_id = ${input.tenderId}
          AND psl.tenant_id = ${input.tenantId}
        LIMIT 1
      `);
      const settlementArr = Array.from(settlementRows as Iterable<Record<string, unknown>>);
      const settlement = settlementArr.length > 0 ? settlementArr[0]! : null;

      steps.push({
        stage: 'settlement',
        label: 'Card Settlement',
        status: settlement && settlement.line_status === 'matched' ? 'complete' : settlement ? 'pending' : 'missing',
        timestamp: settlement?.matched_at ? String(settlement.matched_at) : null,
        referenceId: settlement ? String(settlement.settlement_id) : null,
        detail: settlement
          ? `${String(settlement.processor_name)} — ${String(settlement.settlement_date)}${Number(settlement.fee_cents) > 0 ? ` (fee: $${(Number(settlement.fee_cents) / 100).toFixed(2)})` : ''}`
          : 'Not yet matched to a settlement',
      });
    }

    // Step 5: Deposit
    const depositRows = await tx.execute(sql`
      SELECT
        ds.id,
        ds.status,
        ds.deposited_at::text,
        ds.reconciled_at::text,
        ds.total_amount_cents
      FROM deposit_slips ds
      JOIN retail_close_batches rcb ON rcb.id = ANY(ds.retail_close_batch_ids)
      JOIN drawer_sessions drs ON drs.id = rcb.drawer_session_id
      JOIN tenders t ON t.terminal_id = drs.terminal_id
        AND t.business_date = drs.business_date
        AND t.tenant_id = drs.tenant_id
      WHERE t.id = ${input.tenderId}
        AND ds.tenant_id = ${input.tenantId}
      LIMIT 1
    `);
    const depositArr = Array.from(depositRows as Iterable<Record<string, unknown>>);
    const deposit = depositArr.length > 0 ? depositArr[0]! : null;

    steps.push({
      stage: 'deposit',
      label: 'Deposit',
      status: deposit && deposit.status === 'reconciled' ? 'complete' : deposit ? 'pending' : 'missing',
      timestamp: deposit?.reconciled_at ? String(deposit.reconciled_at) : deposit?.deposited_at ? String(deposit.deposited_at) : null,
      referenceId: deposit ? String(deposit.id) : null,
      detail: deposit ? `Status: ${String(deposit.status)}` : 'Not yet included in a deposit',
    });

    return {
      tenderId: String(tender.id),
      tenderType: String(tender.tender_type),
      amountCents: Number(tender.amount),
      tipAmountCents: Number(tender.tip_amount) || 0,
      orderId: String(tender.order_id),
      orderNumber: order ? String(order.order_number) : null,
      businessDate: String(tender.business_date),
      locationId: String(tender.location_id),
      employeeId: tender.employee_id ? String(tender.employee_id) : null,
      steps,
    };
  });
}
