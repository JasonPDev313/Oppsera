import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface SettlementDetail {
  id: string;
  locationId: string | null;
  settlementDate: string;
  processorName: string;
  processorBatchId: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  chargebackAmount: number;
  status: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  glJournalEntryId: string | null;
  importSource: string;
  businessDateFrom: string | null;
  businessDateTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: SettlementLineDetail[];
}

export interface SettlementLineDetail {
  id: string;
  tenderId: string | null;
  originalAmountCents: number;
  settledAmountCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  matchedAt: string | null;
  // Enriched from tender join
  tenderType: string | null;
  tenderBusinessDate: string | null;
  orderId: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
}

interface GetSettlementInput {
  tenantId: string;
  settlementId: string;
}

export async function getSettlement(
  input: GetSettlementInput,
): Promise<SettlementDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch settlement header
    const headerRows = await tx.execute(sql`
      SELECT
        s.id,
        s.location_id,
        s.settlement_date,
        s.processor_name,
        s.processor_batch_id,
        s.gross_amount,
        s.fee_amount,
        s.net_amount,
        s.chargeback_amount,
        s.status,
        s.bank_account_id,
        ba.name AS bank_account_name,
        s.gl_journal_entry_id,
        s.import_source,
        s.business_date_from,
        s.business_date_to,
        s.notes,
        s.created_at,
        s.updated_at
      FROM payment_settlements s
      LEFT JOIN bank_accounts ba ON ba.id = s.bank_account_id
      WHERE s.tenant_id = ${input.tenantId}
        AND s.id = ${input.settlementId}
      LIMIT 1
    `);

    const headers = Array.from(headerRows as Iterable<Record<string, unknown>>);
    if (headers.length === 0) return null;

    const h = headers[0]!;

    // Fetch lines with tender enrichment
    const lineRows = await tx.execute(sql`
      SELECT
        psl.id,
        psl.tender_id,
        psl.original_amount_cents,
        psl.settled_amount_cents,
        psl.fee_cents,
        psl.net_cents,
        psl.status,
        psl.matched_at,
        t.tender_type,
        t.business_date AS tender_business_date,
        t.order_id,
        t.card_last4,
        t.card_brand
      FROM payment_settlement_lines psl
      LEFT JOIN tenders t ON t.id = psl.tender_id
      WHERE psl.tenant_id = ${input.tenantId}
        AND psl.settlement_id = ${input.settlementId}
      ORDER BY psl.created_at
    `);

    const lines = Array.from(lineRows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenderId: row.tender_id ? String(row.tender_id) : null,
      originalAmountCents: Number(row.original_amount_cents),
      settledAmountCents: Number(row.settled_amount_cents),
      feeCents: Number(row.fee_cents),
      netCents: Number(row.net_cents),
      status: String(row.status),
      matchedAt: row.matched_at ? String(row.matched_at) : null,
      tenderType: row.tender_type ? String(row.tender_type) : null,
      tenderBusinessDate: row.tender_business_date ? String(row.tender_business_date) : null,
      orderId: row.order_id ? String(row.order_id) : null,
      cardLast4: row.card_last4 ? String(row.card_last4) : null,
      cardBrand: row.card_brand ? String(row.card_brand) : null,
    }));

    return {
      id: String(h.id),
      locationId: h.location_id ? String(h.location_id) : null,
      settlementDate: String(h.settlement_date),
      processorName: String(h.processor_name),
      processorBatchId: h.processor_batch_id ? String(h.processor_batch_id) : null,
      grossAmount: Number(h.gross_amount),
      feeAmount: Number(h.fee_amount),
      netAmount: Number(h.net_amount),
      chargebackAmount: Number(h.chargeback_amount),
      status: String(h.status),
      bankAccountId: h.bank_account_id ? String(h.bank_account_id) : null,
      bankAccountName: h.bank_account_name ? String(h.bank_account_name) : null,
      glJournalEntryId: h.gl_journal_entry_id ? String(h.gl_journal_entry_id) : null,
      importSource: String(h.import_source),
      businessDateFrom: h.business_date_from ? String(h.business_date_from) : null,
      businessDateTo: h.business_date_to ? String(h.business_date_to) : null,
      notes: h.notes ? String(h.notes) : null,
      createdAt: String(h.created_at),
      updatedAt: String(h.updated_at),
      lines,
    };
  });
}
