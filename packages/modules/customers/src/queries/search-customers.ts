import { eq, and, ilike, or, not, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customers, customerIdentifiers } from '@oppsera/db';

export interface SearchCustomersInput {
  tenantId: string;
  search?: string;
  identifier?: string;
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
        .limit(10);

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
        .limit(10);
    }

    // Text search on display name, email, phone
    // Uses pg_trgm GIN index (0055 migration) for fast ILIKE
    if (input.search) {
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
        .limit(10);
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
      .limit(10);
  });
}
