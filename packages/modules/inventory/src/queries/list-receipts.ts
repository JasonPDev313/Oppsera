import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { receivingReceipts, vendors } from '@oppsera/db';

export interface ListReceiptsInput {
  tenantId: string;
  locationId?: string;
  status?: string;
  vendorId?: string;
  cursor?: string;
  limit?: number;
}

export interface ReceiptSummary {
  id: string;
  receiptNumber: string;
  status: string;
  vendorId: string;
  vendorName: string;
  locationId: string;
  receivedDate: string;
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  total: number;
  vendorInvoiceNumber: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface ListReceiptsResult {
  items: ReceiptSummary[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listReceipts(input: ListReceiptsInput): Promise<ListReceiptsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(receivingReceipts.tenantId, input.tenantId),
    ];

    if (input.locationId) conditions.push(eq(receivingReceipts.locationId, input.locationId));
    if (input.status) conditions.push(eq(receivingReceipts.status, input.status));
    if (input.vendorId) conditions.push(eq(receivingReceipts.vendorId, input.vendorId));
    if (input.cursor) conditions.push(lt(receivingReceipts.id, input.cursor));

    const rows = await tx
      .select({
        receipt: receivingReceipts,
        vendorName: vendors.name,
      })
      .from(receivingReceipts)
      .innerJoin(vendors, eq(receivingReceipts.vendorId, vendors.id))
      .where(and(...conditions))
      .orderBy(desc(receivingReceipts.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.receipt.id,
        receiptNumber: r.receipt.receiptNumber,
        status: r.receipt.status,
        vendorId: r.receipt.vendorId,
        vendorName: r.vendorName,
        locationId: r.receipt.locationId,
        receivedDate: r.receipt.receivedDate,
        subtotal: Number(r.receipt.subtotal),
        shippingCost: Number(r.receipt.shippingCost),
        taxAmount: Number(r.receipt.taxAmount),
        total: Number(r.receipt.total),
        vendorInvoiceNumber: r.receipt.vendorInvoiceNumber ?? null,
        postedAt: r.receipt.postedAt?.toISOString() ?? null,
        createdAt: r.receipt.createdAt.toISOString(),
      })),
      cursor: hasMore ? items[items.length - 1]!.receipt.id : null,
      hasMore,
    };
  });
}
