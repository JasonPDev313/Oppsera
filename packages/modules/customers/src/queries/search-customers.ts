import { eq, and, ilike, or, not } from 'drizzle-orm';
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
      const { inArray } = await import('drizzle-orm');

      const rows = await tx
        .select({
          id: customers.id,
          displayName: customers.displayName,
          email: customers.email,
          phone: customers.phone,
          type: customers.type,
        })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, input.tenantId),
            inArray(customers.id, customerIds),
            not(ilike(customers.displayName, '[MERGED]%')),
          ),
        )
        .limit(10);

      return rows;
    }

    // Text search on display name, email, phone
    const conditions = [
      eq(customers.tenantId, input.tenantId),
      not(ilike(customers.displayName, '[MERGED]%')),
    ];

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(customers.displayName, pattern),
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern),
        )!,
      );
    }

    const rows = await tx
      .select({
        id: customers.id,
        displayName: customers.displayName,
        email: customers.email,
        phone: customers.phone,
        type: customers.type,
      })
      .from(customers)
      .where(and(...conditions))
      .limit(10);

    return rows;
  });
}
