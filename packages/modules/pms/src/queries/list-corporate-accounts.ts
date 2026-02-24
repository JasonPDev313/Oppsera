import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CorporateAccountListItem {
  id: string;
  propertyId: string | null;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  billingType: string;
  negotiatedDiscountPct: number | null;
  creditLimitCents: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListCorporateAccountsInput {
  tenantId: string;
  propertyId?: string;
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListCorporateAccountsResult {
  items: CorporateAccountListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listCorporateAccounts(
  input: ListCorporateAccountsInput,
): Promise<ListCorporateAccountsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`tenant_id = ${input.tenantId}`,
    ];

    // Filter by property: show property-specific + cross-property accounts
    if (input.propertyId) {
      conditions.push(sql`(property_id = ${input.propertyId} OR property_id IS NULL)`);
    }

    if (input.search) {
      conditions.push(sql`company_name ILIKE ${'%' + input.search + '%'}`);
    }

    if (input.isActive !== undefined) {
      conditions.push(sql`is_active = ${input.isActive}`);
    }

    if (input.cursor) {
      conditions.push(sql`id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        id, property_id, company_name, contact_name, contact_email,
        billing_type, negotiated_discount_pct, credit_limit_cents,
        is_active, created_at, updated_at
      FROM pms_corporate_accounts
      WHERE ${whereClause}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map((r) => ({
        id: String(r.id),
        propertyId: r.property_id ? String(r.property_id) : null,
        companyName: String(r.company_name),
        contactName: r.contact_name ? String(r.contact_name) : null,
        contactEmail: r.contact_email ? String(r.contact_email) : null,
        billingType: String(r.billing_type),
        negotiatedDiscountPct: r.negotiated_discount_pct != null ? Number(r.negotiated_discount_pct) : null,
        creditLimitCents: r.credit_limit_cents != null ? Number(r.credit_limit_cents) : null,
        isActive: Boolean(r.is_active),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
