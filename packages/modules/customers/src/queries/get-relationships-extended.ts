import { eq, and, or, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerRelationships, customers } from '@oppsera/db';

export interface GetRelationshipsExtendedInput {
  tenantId: string;
  customerId: string;
}

export interface RelationshipExtended {
  id: string;
  parentCustomerId: string;
  childCustomerId: string;
  relationshipType: string;
  isPrimary: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
  notes: string | null;
  createdAt: Date;
  relatedCustomer: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
  };
}

export interface GetRelationshipsExtendedResult {
  relationships: RelationshipExtended[];
}

export async function getRelationshipsExtended(
  input: GetRelationshipsExtendedInput,
): Promise<GetRelationshipsExtendedResult> {
  return withTenant(input.tenantId, async (tx) => {
    // Get relationships where this customer is either parent or child
    const rels = await tx
      .select()
      .from(customerRelationships)
      .where(
        and(
          eq(customerRelationships.tenantId, input.tenantId),
          or(
            eq(customerRelationships.parentCustomerId, input.customerId),
            eq(customerRelationships.childCustomerId, input.customerId),
          ),
        ),
      );

    if (rels.length === 0) {
      return { relationships: [] };
    }

    // Collect the IDs of related customers (the "other" side of each relationship)
    const relatedCustomerIds = [
      ...new Set(
        rels.map((r) =>
          r.parentCustomerId === input.customerId ? r.childCustomerId : r.parentCustomerId,
        ),
      ),
    ];

    // Fetch only the related customers we need
    const relatedCustomers = await tx
      .select({
        id: customers.id,
        displayName: customers.displayName,
        email: customers.email,
        status: customers.status,
      })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, input.tenantId),
          inArray(customers.id, relatedCustomerIds),
        ),
      );

    // Build a lookup map
    const customerMap = new Map<string, { id: string; displayName: string; email: string | null; status: string }>();
    for (const c of relatedCustomers) {
      customerMap.set(c.id, {
        id: c.id,
        displayName: c.displayName,
        email: c.email,
        status: c.status,
      });
    }

    const relationships: RelationshipExtended[] = rels.map((rel) => {
      const relatedId = rel.parentCustomerId === input.customerId
        ? rel.childCustomerId
        : rel.parentCustomerId;

      const relatedCustomer = customerMap.get(relatedId) ?? {
        id: relatedId,
        displayName: 'Unknown',
        email: null,
        status: 'unknown',
      };

      return {
        id: rel.id,
        parentCustomerId: rel.parentCustomerId,
        childCustomerId: rel.childCustomerId,
        relationshipType: rel.relationshipType,
        isPrimary: rel.isPrimary,
        effectiveDate: rel.effectiveDate,
        expirationDate: rel.expirationDate,
        notes: rel.notes ?? null,
        createdAt: rel.createdAt,
        relatedCustomer,
      };
    });

    return { relationships };
  });
}
