import { eq, and, lt, desc, asc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { vendors } from '@oppsera/db';

export interface ListVendorsInput {
  tenantId: string;
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface VendorSummary {
  id: string;
  name: string;
  accountNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string | null;
  isActive: boolean;
  itemCount: number;
  lastReceiptDate: string | null;
  createdAt: string;
}

export interface ListVendorsResult {
  items: VendorSummary[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listVendors(input: ListVendorsInput): Promise<ListVendorsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: string[] = [`v.tenant_id = $1`];
    const params: unknown[] = [input.tenantId];
    let paramIdx = 2;

    if (input.isActive !== undefined) {
      conditions.push(`v.is_active = $${paramIdx}`);
      params.push(input.isActive);
      paramIdx++;
    }
    if (input.cursor) {
      conditions.push(`v.id < $${paramIdx}`);
      params.push(input.cursor);
      paramIdx++;
    }
    if (input.search) {
      conditions.push(`(v.name ILIKE $${paramIdx} OR v.account_number ILIKE $${paramIdx})`);
      params.push(`%${input.search}%`);
      paramIdx++;
    }

    // Use raw SQL for the joined aggregation query
    const result = await tx.execute(
      sql.raw(`
        SELECT v.*,
               COALESCE(ic.item_count, 0)::int AS item_count,
               rc.last_receipt_date
        FROM vendors v
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS item_count
          FROM item_vendors iv
          WHERE iv.tenant_id = v.tenant_id AND iv.vendor_id = v.id AND iv.is_active = true
        ) ic ON true
        LEFT JOIN LATERAL (
          SELECT MAX(received_date) AS last_receipt_date
          FROM receiving_receipts rr
          WHERE rr.tenant_id = v.tenant_id AND rr.vendor_id = v.id AND rr.status = 'posted'
        ) rc ON true
        WHERE ${conditions.join(' AND ')}
        ORDER BY v.name ASC
        LIMIT ${limit + 1}
      `),
    );

    // Since sql.raw doesn't support parameterized bindings well, let's use the Drizzle sql template instead
    // Rewrite with Drizzle sql template
    const whereClause: ReturnType<typeof eq>[] = [
      eq(vendors.tenantId, input.tenantId),
    ];

    if (input.isActive !== undefined) whereClause.push(eq(vendors.isActive, input.isActive));
    if (input.cursor) whereClause.push(lt(vendors.id, input.cursor));
    if (input.search) {
      whereClause.push(
        sql`(${vendors.name} ILIKE ${'%' + input.search + '%'} OR ${vendors.accountNumber} ILIKE ${'%' + input.search + '%'})`,
      );
    }

    const rows = await tx
      .select()
      .from(vendors)
      .where(and(...whereClause))
      .orderBy(asc(vendors.name))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Batch-fetch item counts and last receipt dates for the page
    const vendorIds = items.map((v) => v.id);
    if (vendorIds.length === 0) {
      return { items: [], cursor: null, hasMore: false };
    }

    const catalogCounts = await tx.execute(
      sql`SELECT vendor_id, COUNT(*)::int AS cnt
          FROM item_vendors
          WHERE tenant_id = ${input.tenantId} AND vendor_id = ANY(${vendorIds}) AND is_active = true
          GROUP BY vendor_id`,
    );
    const countMap = new Map<string, number>();
    for (const row of catalogCounts as any) {
      countMap.set(row.vendor_id, Number(row.cnt));
    }

    const receiptDates = await tx.execute(
      sql`SELECT vendor_id, MAX(received_date) AS last_date
          FROM receiving_receipts
          WHERE tenant_id = ${input.tenantId} AND vendor_id = ANY(${vendorIds}) AND status = 'posted'
          GROUP BY vendor_id`,
    );
    const dateMap = new Map<string, string>();
    for (const row of receiptDates as any) {
      dateMap.set(row.vendor_id, row.last_date);
    }

    return {
      items: items.map((v) => ({
        id: v.id,
        name: v.name,
        accountNumber: v.accountNumber ?? null,
        contactName: v.contactName ?? null,
        contactEmail: v.contactEmail ?? null,
        contactPhone: v.contactPhone ?? null,
        paymentTerms: v.paymentTerms ?? null,
        isActive: v.isActive,
        itemCount: countMap.get(v.id) ?? 0,
        lastReceiptDate: dateMap.get(v.id) ?? null,
        createdAt: v.createdAt.toISOString(),
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

// ── Lightweight search for vendor picker dropdowns ────────────────

export interface VendorSearchResult {
  id: string;
  name: string;
  accountNumber: string | null;
}

export async function searchVendors(
  tenantId: string,
  query: string,
): Promise<VendorSearchResult[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: vendors.id,
        name: vendors.name,
        accountNumber: vendors.accountNumber,
      })
      .from(vendors)
      .where(
        and(
          eq(vendors.tenantId, tenantId),
          eq(vendors.isActive, true),
          sql`(${vendors.name} ILIKE ${'%' + query + '%'} OR ${vendors.accountNumber} ILIKE ${'%' + query + '%'})`,
        ),
      )
      .orderBy(asc(vendors.name))
      .limit(20);

    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      accountNumber: v.accountNumber ?? null,
    }));
  });
}
