import { eq, and, ilike, or, not, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customers, customerIdentifiers } from '@oppsera/db';

export interface SearchCustomersInput {
  tenantId: string;
  search?: string;
  identifier?: string;
  /** Max results to return (default 10, max 500) */
  limit?: number;
}

export interface SearchCustomerResult {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  type: string;
}

const SELECT_FIELDS = {
  id: customers.id,
  displayName: customers.displayName,
  email: customers.email,
  phone: customers.phone,
  type: customers.type,
} as const;

const NOT_MERGED = not(ilike(customers.displayName, '[MERGED]%'));

export async function searchCustomers(
  input: SearchCustomersInput,
): Promise<SearchCustomerResult[]> {
  const cap = Math.min(Math.max(input.limit ?? 10, 1), 500);

  return withTenant(input.tenantId, async (tx) => {
    // If searching by identifier, find matching customer IDs first
    if (input.identifier) {
      const identifierMatches = await tx
        .select({ customerId: customerIdentifiers.customerId })
        .from(customerIdentifiers)
        .where(
          and(
            eq(customerIdentifiers.tenantId, input.tenantId),
            eq(customerIdentifiers.value, input.identifier),
            eq(customerIdentifiers.isActive, true),
          ),
        )
        .limit(cap);

      if (identifierMatches.length === 0) {
        return [];
      }

      const customerIds = identifierMatches.map((m) => m.customerId);

      return tx
        .select(SELECT_FIELDS)
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, input.tenantId),
            inArray(customers.id, customerIds),
            NOT_MERGED,
          ),
        )
        .limit(cap);
    }

    // Text search: try prefix match on displayName first (fast B-tree),
    // fall back to contains match on all fields (pg_trgm GIN index)
    if (input.search) {
      const prefix = `${input.search}%`;
      const prefixResults = await tx
        .select(SELECT_FIELDS)
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, input.tenantId),
            NOT_MERGED,
            ilike(customers.displayName, prefix),
          ),
        )
        .orderBy(customers.displayName)
        .limit(cap);

      if (prefixResults.length > 0) return prefixResults;

      // No prefix hits — broaden to contains on name, email, phone
      const pattern = `%${input.search}%`;
      return tx
        .select(SELECT_FIELDS)
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, input.tenantId),
            NOT_MERGED,
            or(
              ilike(customers.displayName, pattern),
              ilike(customers.email, pattern),
              ilike(customers.phone, pattern),
            ),
          ),
        )
        .orderBy(customers.displayName)
        .limit(cap);
    }

    // No search term — return most recent customers
    return tx
      .select(SELECT_FIELDS)
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, input.tenantId),
          NOT_MERGED,
        ),
      )
      .orderBy(sql`${customers.lastVisitAt} DESC NULLS LAST`)
      .limit(cap);
  });
}
