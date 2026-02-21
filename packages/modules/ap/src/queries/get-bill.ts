import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetBillInput {
  tenantId: string;
  billId: string;
}

export interface BillLine {
  id: string;
  description: string;
  lineType: string;
  glAccountId: string;
  glAccountNumber: string | null;
  glAccountName: string | null;
  amount: number;
  quantity: number;
  unitCost: number | null;
  locationId: string | null;
  departmentId: string | null;
  inventoryItemId: string | null;
  receivingReceiptId: string | null;
  purchaseOrderId: string | null;
  memo: string | null;
  sortOrder: number;
}

export interface BillPaymentAllocation {
  id: string;
  paymentId: string;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string | null;
  amount: number;
  allocatedAt: string;
}

export interface BillDetail {
  id: string;
  tenantId: string;
  vendorId: string;
  vendorName: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentTermsId: string | null;
  locationId: string | null;
  memo: string | null;
  vendorInvoiceNumber: string | null;
  glJournalEntryId: string | null;
  version: number;
  postedAt: string | null;
  postedBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines: BillLine[];
  paymentAllocations: BillPaymentAllocation[];
}

export async function getBill(input: GetBillInput): Promise<BillDetail> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Fetch bill with vendor name
    const billRows = await tx.execute(sql`
      SELECT
        b.*,
        v.name AS vendor_name
      FROM ap_bills b
      INNER JOIN vendors v ON v.id = b.vendor_id
      WHERE b.id = ${input.billId}
        AND b.tenant_id = ${input.tenantId}
      LIMIT 1
    `);

    const bills = Array.from(billRows as Iterable<Record<string, unknown>>);
    if (bills.length === 0) {
      throw new NotFoundError('Bill', input.billId);
    }
    const bill = bills[0]!;

    // 2. Fetch lines with GL account info
    const lineRows = await tx.execute(sql`
      SELECT
        bl.id,
        bl.description,
        bl.line_type,
        bl.gl_account_id,
        a.account_number AS gl_account_number,
        a.name AS gl_account_name,
        bl.amount,
        bl.quantity,
        bl.unit_cost,
        bl.location_id,
        bl.department_id,
        bl.inventory_item_id,
        bl.receiving_receipt_id,
        bl.purchase_order_id,
        bl.memo,
        bl.sort_order
      FROM ap_bill_lines bl
      LEFT JOIN gl_accounts a ON a.id = bl.gl_account_id
      WHERE bl.bill_id = ${input.billId}
        AND bl.tenant_id = ${input.tenantId}
      ORDER BY bl.sort_order, bl.id
    `);

    const lines = Array.from(lineRows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      description: String(row.description),
      lineType: String(row.line_type),
      glAccountId: String(row.gl_account_id),
      glAccountNumber: row.gl_account_number ? String(row.gl_account_number) : null,
      glAccountName: row.gl_account_name ? String(row.gl_account_name) : null,
      amount: Number(row.amount),
      quantity: Number(row.quantity),
      unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
      locationId: row.location_id ? String(row.location_id) : null,
      departmentId: row.department_id ? String(row.department_id) : null,
      inventoryItemId: row.inventory_item_id ? String(row.inventory_item_id) : null,
      receivingReceiptId: row.receiving_receipt_id ? String(row.receiving_receipt_id) : null,
      purchaseOrderId: row.purchase_order_id ? String(row.purchase_order_id) : null,
      memo: row.memo ? String(row.memo) : null,
      sortOrder: Number(row.sort_order),
    }));

    // 3. Fetch payment allocations
    const allocationRows = await tx.execute(sql`
      SELECT
        pa.id,
        pa.payment_id,
        p.payment_date,
        p.payment_method,
        p.reference_number,
        pa.amount,
        pa.created_at AS allocated_at
      FROM ap_payment_allocations pa
      INNER JOIN ap_payments p ON p.id = pa.payment_id
      WHERE pa.bill_id = ${input.billId}
        AND pa.tenant_id = ${input.tenantId}
        AND p.status != 'voided'
      ORDER BY pa.created_at
    `);

    const paymentAllocations = Array.from(allocationRows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      paymentId: String(row.payment_id),
      paymentDate: String(row.payment_date),
      paymentMethod: String(row.payment_method),
      referenceNumber: row.reference_number ? String(row.reference_number) : null,
      amount: Number(row.amount),
      allocatedAt: String(row.allocated_at),
    }));

    const totalAmount = Number(bill.total_amount);
    const paidAmount = paymentAllocations.reduce((sum, a) => sum + a.amount, 0);

    return {
      id: String(bill.id),
      tenantId: String(bill.tenant_id),
      vendorId: String(bill.vendor_id),
      vendorName: String(bill.vendor_name),
      billNumber: String(bill.bill_number),
      billDate: String(bill.bill_date),
      dueDate: String(bill.due_date),
      status: String(bill.status),
      totalAmount,
      paidAmount,
      remainingAmount: totalAmount - paidAmount,
      paymentTermsId: bill.payment_terms_id ? String(bill.payment_terms_id) : null,
      locationId: bill.location_id ? String(bill.location_id) : null,
      memo: bill.memo ? String(bill.memo) : null,
      vendorInvoiceNumber: bill.vendor_invoice_number ? String(bill.vendor_invoice_number) : null,
      glJournalEntryId: bill.gl_journal_entry_id ? String(bill.gl_journal_entry_id) : null,
      version: Number(bill.version),
      postedAt: bill.posted_at ? String(bill.posted_at) : null,
      postedBy: bill.posted_by ? String(bill.posted_by) : null,
      voidedAt: bill.voided_at ? String(bill.voided_at) : null,
      voidedBy: bill.voided_by ? String(bill.voided_by) : null,
      voidReason: bill.void_reason ? String(bill.void_reason) : null,
      createdBy: String(bill.created_by),
      createdAt: String(bill.created_at),
      updatedAt: String(bill.updated_at),
      lines,
      paymentAllocations,
    };
  });
}
