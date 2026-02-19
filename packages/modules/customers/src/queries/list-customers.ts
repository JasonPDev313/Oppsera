import { eq, and, asc, not, ilike, or, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customers } from '@oppsera/db';

export interface ListCustomersInput {
  tenantId: string;
  search?: string;
  tags?: unknown[];
  cursor?: string;
  limit?: number;
}

/** Slim projection for the list view — skips heavy JSONB profile columns. */
export interface CustomerListItem {
  id: string;
  tenantId: string;
  type: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  displayName: string;
  notes: string | null;
  tags: unknown;
  marketingConsent: boolean;
  taxExempt: boolean;
  taxExemptCertificateNumber: string | null;
  totalVisits: number;
  totalSpend: number;
  lastVisitAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface ListCustomersResult {
  items: CustomerListItem[];
  cursor: string | null;
  hasMore: boolean;
}

// Select only the columns the frontend Customer type needs.
// The customers table has 56 columns including heavy JSONB blobs
// (complianceData, aiFields, behavioralProfile, etc.) that the
// list view never uses. This projection skips ~35 columns.
const listColumns = {
  id: customers.id,
  tenantId: customers.tenantId,
  type: customers.type,
  email: customers.email,
  phone: customers.phone,
  firstName: customers.firstName,
  lastName: customers.lastName,
  organizationName: customers.organizationName,
  displayName: customers.displayName,
  notes: customers.notes,
  tags: customers.tags,
  marketingConsent: customers.marketingConsent,
  taxExempt: customers.taxExempt,
  taxExemptCertificateNumber: customers.taxExemptCertificateNumber,
  totalVisits: customers.totalVisits,
  totalSpend: customers.totalSpend,
  lastVisitAt: customers.lastVisitAt,
  metadata: customers.metadata,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
  createdBy: customers.createdBy,
};

export async function listCustomers(input: ListCustomersInput): Promise<ListCustomersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(customers.tenantId, input.tenantId),
      not(ilike(customers.displayName, '[MERGED]%')),
    ];

    if (input.cursor) {
      // For displayName ascending pagination, cursor is the last displayName + id composite
      // We use id as a tiebreaker for stable pagination
      conditions.push(
        or(
          sql`${customers.displayName} > (SELECT display_name FROM customers WHERE id = ${input.cursor})`,
          and(
            sql`${customers.displayName} = (SELECT display_name FROM customers WHERE id = ${input.cursor})`,
            sql`${customers.id} > ${input.cursor}`,
          )!,
        )!,
      );
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern),
          ilike(customers.displayName, pattern),
        )!,
      );
    }

    if (input.tags && input.tags.length > 0) {
      conditions.push(sql`${customers.tags} @> ${JSON.stringify(input.tags)}::jsonb`);
    }

    const rows = await tx
      .select(listColumns)
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.displayName), asc(customers.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
