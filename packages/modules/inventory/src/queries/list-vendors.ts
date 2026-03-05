import { eq, and, asc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { vendors } from '@oppsera/db';

function encodeCursor(...parts: string[]): string {
  return parts.join('|');
}

function decodeCursor(cursor: string, expectedParts: number): string[] | null {
  const parts = cursor.split('|');
  if (parts.length !== expectedParts) return null; // Legacy fallback
  return parts;
}

export interface ListVendorsInput {
  tenantId: string;
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
  /** When true, skip expensive LATERAL joins (itemCount, lastReceiptDate). Use for dropdowns. */
  minimal?: boolean;
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
    const conditions = [sql`v.tenant_id = ${input.tenantId}`];
    if (input.isActive !== undefined) conditions.push(sql`v.is_active = ${input.isActive}`);

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor, 2);
      if (decoded) {
        const [cursorName, cursorId] = decoded as [string, string];
        // Both name ASC and id ASC — row-value > works
        conditions.push(sql`(v.name, v.id) > (${cursorName}, ${cursorId})`);
      } else {
        // Legacy: cursor was plain id — fall back to id > for ASC sort
        conditions.push(sql`v.id > ${input.cursor}`);
      }
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(sql`(v.name ILIKE ${pattern} OR v.account_number ILIKE ${pattern})`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    // Fast path: skip expensive LATERAL joins when caller only needs id + name
    if (input.minimal) {
      const rows = await tx.execute(sql`
        SELECT v.id, v.name, v.account_number, v.contact_name, v.contact_email,
               v.contact_phone, v.payment_terms, v.is_active, v.created_at
        FROM vendors v
        WHERE ${whereClause}
        ORDER BY v.name ASC, v.id ASC
        LIMIT ${limit + 1}
      `);

      const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
      const hasMore = allRows.length > limit;
      const items = hasMore ? allRows.slice(0, limit) : allRows;
      const lastItem = items[items.length - 1];

      return {
        items: items.map((v) => ({
          id: v.id as string,
          name: v.name as string,
          accountNumber: (v.account_number as string) ?? null,
          contactName: (v.contact_name as string) ?? null,
          contactEmail: (v.contact_email as string) ?? null,
          contactPhone: (v.contact_phone as string) ?? null,
          paymentTerms: (v.payment_terms as string) ?? null,
          isActive: v.is_active as boolean,
          itemCount: 0,
          lastReceiptDate: null,
          createdAt: v.created_at instanceof Date ? (v.created_at as Date).toISOString() : String(v.created_at),
        })),
        cursor: hasMore && lastItem
          ? encodeCursor(lastItem.name as string, lastItem.id as string)
          : null,
        hasMore,
      };
    }

    // Full path: includes item count + last receipt date via LEFT JOIN LATERAL
    const rows = await tx.execute(sql`
      SELECT v.id, v.name, v.account_number, v.contact_name, v.contact_email,
             v.contact_phone, v.payment_terms, v.is_active, v.created_at,
             COALESCE(ic.cnt, 0)::int AS item_count,
             rc.last_date AS last_receipt_date
      FROM vendors v
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM item_vendors iv
        WHERE iv.vendor_id = v.id AND iv.tenant_id = v.tenant_id AND iv.is_active = true
      ) ic ON true
      LEFT JOIN LATERAL (
        SELECT MAX(received_date)::text AS last_date
        FROM receiving_receipts rr
        WHERE rr.vendor_id = v.id AND rr.tenant_id = v.tenant_id AND rr.status = 'posted'
      ) rc ON true
      WHERE ${whereClause}
      ORDER BY v.name ASC, v.id ASC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;
    const lastItem = items[items.length - 1];

    return {
      items: items.map((v) => ({
        id: v.id as string,
        name: v.name as string,
        accountNumber: (v.account_number as string) ?? null,
        contactName: (v.contact_name as string) ?? null,
        contactEmail: (v.contact_email as string) ?? null,
        contactPhone: (v.contact_phone as string) ?? null,
        paymentTerms: (v.payment_terms as string) ?? null,
        isActive: v.is_active as boolean,
        itemCount: Number(v.item_count) || 0,
        lastReceiptDate: (v.last_receipt_date as string) ?? null,
        createdAt: v.created_at instanceof Date ? (v.created_at as Date).toISOString() : String(v.created_at),
      })),
      cursor: hasMore && lastItem
        ? encodeCursor(lastItem.name as string, lastItem.id as string)
        : null,
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
