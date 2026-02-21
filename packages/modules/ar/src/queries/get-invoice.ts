import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface InvoiceLine {
  id: string;
  accountId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxGroupId: string | null;
  taxAmount: number;
  sortOrder: number;
}

export interface InvoiceAllocation {
  receiptId: string;
  amountApplied: number;
  createdAt: string;
}

export interface InvoiceDetail {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  billingAccountId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  memo: string | null;
  locationId: string | null;
  currency: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  glJournalEntryId: string | null;
  sourceType: string;
  sourceReferenceId: string | null;
  createdBy: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  lines: InvoiceLine[];
  allocations: InvoiceAllocation[];
}

interface GetInvoiceInput {
  tenantId: string;
  invoiceId: string;
}

export async function getInvoice(input: GetInvoiceInput): Promise<InvoiceDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Fetch invoice header
    const invoiceRows = await tx.execute(sql`
      SELECT
        i.id, i.tenant_id, i.customer_id, c.display_name AS customer_name,
        i.billing_account_id, i.invoice_number, i.invoice_date, i.due_date,
        i.status, i.memo, i.location_id, i.currency,
        i.total_amount, i.amount_paid, i.balance_due,
        i.gl_journal_entry_id, i.source_type, i.source_reference_id,
        i.created_by, i.voided_at, i.voided_by, i.void_reason,
        i.created_at, i.updated_at
      FROM ar_invoices i
      LEFT JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
      WHERE i.id = ${input.invoiceId}
        AND i.tenant_id = ${input.tenantId}
      LIMIT 1
    `);

    const invArr = Array.from(invoiceRows as Iterable<Record<string, unknown>>);
    if (invArr.length === 0) return null;

    const inv = invArr[0]!;

    // 2. Fetch invoice lines
    const lineRows = await tx.execute(sql`
      SELECT id, account_id, description, quantity, unit_price, amount,
             tax_group_id, tax_amount, sort_order
      FROM ar_invoice_lines
      WHERE invoice_id = ${input.invoiceId}
      ORDER BY sort_order ASC, id ASC
    `);

    const lines = Array.from(lineRows as Iterable<Record<string, unknown>>).map((l) => ({
      id: String(l.id),
      accountId: String(l.account_id),
      description: String(l.description),
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      amount: Number(l.amount),
      taxGroupId: l.tax_group_id ? String(l.tax_group_id) : null,
      taxAmount: Number(l.tax_amount),
      sortOrder: Number(l.sort_order),
    }));

    // 3. Fetch receipt allocations
    const allocRows = await tx.execute(sql`
      SELECT receipt_id, amount_applied, created_at
      FROM ar_receipt_allocations
      WHERE invoice_id = ${input.invoiceId}
      ORDER BY created_at ASC
    `);

    const allocations = Array.from(allocRows as Iterable<Record<string, unknown>>).map((a) => ({
      receiptId: String(a.receipt_id),
      amountApplied: Number(a.amount_applied),
      createdAt: String(a.created_at),
    }));

    return {
      id: String(inv.id),
      tenantId: String(inv.tenant_id),
      customerId: String(inv.customer_id),
      customerName: inv.customer_name ? String(inv.customer_name) : null,
      billingAccountId: inv.billing_account_id ? String(inv.billing_account_id) : null,
      invoiceNumber: String(inv.invoice_number),
      invoiceDate: String(inv.invoice_date),
      dueDate: String(inv.due_date),
      status: String(inv.status),
      memo: inv.memo ? String(inv.memo) : null,
      locationId: inv.location_id ? String(inv.location_id) : null,
      currency: String(inv.currency),
      totalAmount: Number(inv.total_amount),
      amountPaid: Number(inv.amount_paid),
      balanceDue: Number(inv.balance_due),
      glJournalEntryId: inv.gl_journal_entry_id ? String(inv.gl_journal_entry_id) : null,
      sourceType: String(inv.source_type),
      sourceReferenceId: inv.source_reference_id ? String(inv.source_reference_id) : null,
      createdBy: String(inv.created_by),
      voidedAt: inv.voided_at ? String(inv.voided_at) : null,
      voidedBy: inv.voided_by ? String(inv.voided_by) : null,
      voidReason: inv.void_reason ? String(inv.void_reason) : null,
      createdAt: String(inv.created_at),
      updatedAt: String(inv.updated_at),
      lines,
      allocations,
    };
  });
}
