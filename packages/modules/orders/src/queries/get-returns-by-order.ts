import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ReturnOrderSummary {
  returnOrderId: string;
  returnOrderNumber: string;
  returnType: string; // 'full' | 'partial'
  status: string;
  subtotal: number; // negative cents
  taxTotal: number; // negative cents
  total: number; // negative cents
  lineCount: number;
  createdAt: string;
  lines: ReturnLineSummary[];
}

export interface ReturnLineSummary {
  returnLineId: string;
  originalLineId: string | null;
  catalogItemName: string;
  qty: number; // negative
  unitPrice: number;
  lineSubtotal: number; // negative cents
  lineTax: number; // negative cents
  lineTotal: number; // negative cents
}

/**
 * Get all return orders for an original order, with running totals.
 */
export async function getReturnsByOrder(
  tenantId: string,
  originalOrderId: string,
): Promise<{ returns: ReturnOrderSummary[]; totalReturnedCents: number }> {
  return withTenant(tenantId, async (tx) => {
    // Get return orders linked to this original
    const returnOrders = await tx.execute(sql`
      SELECT
        o.id,
        o.order_number,
        o.return_type,
        o.status,
        o.subtotal,
        o.tax_total,
        o.total,
        o.created_at
      FROM orders o
      WHERE o.tenant_id = ${tenantId}
        AND o.return_order_id = ${originalOrderId}
        AND o.status != 'voided'
      ORDER BY o.created_at DESC
    `);

    const returnRows = Array.from(returnOrders as Iterable<Record<string, unknown>>);
    if (returnRows.length === 0) {
      return { returns: [], totalReturnedCents: 0 };
    }

    let totalReturnedCents = 0;
    const returns: ReturnOrderSummary[] = [];

    for (const row of returnRows) {
      const returnOrderId = String(row.id);
      const total = Number(row.total ?? 0);
      totalReturnedCents += Math.abs(total);

      // Get lines for this return order
      const lineRows = await tx.execute(sql`
        SELECT
          ol.id,
          ol.original_line_id,
          ol.catalog_item_name,
          ol.qty,
          ol.unit_price,
          ol.line_subtotal,
          ol.line_tax,
          ol.line_total
        FROM order_lines ol
        WHERE ol.tenant_id = ${tenantId}
          AND ol.order_id = ${returnOrderId}
        ORDER BY ol.sort_order
      `);

      const lines: ReturnLineSummary[] = Array.from(
        lineRows as Iterable<Record<string, unknown>>,
      ).map((lr) => ({
        returnLineId: String(lr.id),
        originalLineId: lr.original_line_id ? String(lr.original_line_id) : null,
        catalogItemName: String(lr.catalog_item_name ?? 'Unknown'),
        qty: Number(lr.qty ?? 0),
        unitPrice: Number(lr.unit_price ?? 0),
        lineSubtotal: Number(lr.line_subtotal ?? 0),
        lineTax: Number(lr.line_tax ?? 0),
        lineTotal: Number(lr.line_total ?? 0),
      }));

      returns.push({
        returnOrderId,
        returnOrderNumber: String(row.order_number ?? ''),
        returnType: String(row.return_type ?? 'partial'),
        status: String(row.status ?? 'open'),
        subtotal: Number(row.subtotal ?? 0),
        taxTotal: Number(row.tax_total ?? 0),
        total,
        lineCount: lines.length,
        createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
        lines,
      });
    }

    return { returns, totalReturnedCents };
  });
}
