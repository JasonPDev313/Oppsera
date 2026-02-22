import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customerPrivileges,
  storedValueInstruments,
  discountRules,
} from '@oppsera/db';

export interface GetCustomerPrivilegesExtendedInput {
  tenantId: string;
  customerId: string;
}

export interface PrivilegeExtendedEntry {
  id: string;
  privilegeType: string;
  value: Record<string, unknown>;
  reason: string | null;
  isActive: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
  expiresAt: string | null;
  notes: string | null;
}

export interface StoredValueByType {
  instrumentType: string;
  count: number;
  balanceCents: number;
}

export interface StoredValueSummary {
  totalInstruments: number;
  totalBalanceCents: number;
  byType: StoredValueByType[];
}

export interface CustomerPrivilegesExtended {
  privileges: PrivilegeExtendedEntry[];
  storedValueSummary: StoredValueSummary;
  discountRuleCount: number;
}

export async function getCustomerPrivilegesExtended(
  input: GetCustomerPrivilegesExtendedInput,
): Promise<CustomerPrivilegesExtended> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch privileges, stored value instruments, and discount rule count in parallel
    const [privilegeRows, svRows, ruleCountResult] = await Promise.all([
      // 1. Customer privileges (all, including inactive for display)
      tx
        .select({
          id: customerPrivileges.id,
          privilegeType: customerPrivileges.privilegeType,
          value: customerPrivileges.value,
          reason: customerPrivileges.reason,
          isActive: customerPrivileges.isActive,
          effectiveDate: customerPrivileges.effectiveDate,
          expirationDate: customerPrivileges.expirationDate,
          expiresAt: customerPrivileges.expiresAt,
          notes: customerPrivileges.notes,
        })
        .from(customerPrivileges)
        .where(
          and(
            eq(customerPrivileges.tenantId, input.tenantId),
            eq(customerPrivileges.customerId, input.customerId),
          ),
        ),

      // 2. Stored value instruments — aggregate by type
      tx
        .select({
          instrumentType: storedValueInstruments.instrumentType,
          count: sql<number>`count(*)::int`,
          balanceCents: sql<number>`coalesce(sum(${storedValueInstruments.currentBalanceCents}), 0)::int`,
        })
        .from(storedValueInstruments)
        .where(
          and(
            eq(storedValueInstruments.tenantId, input.tenantId),
            eq(storedValueInstruments.customerId, input.customerId),
            eq(storedValueInstruments.status, 'active'),
          ),
        )
        .groupBy(storedValueInstruments.instrumentType),

      // 3. Active discount rules applicable to this customer (count only)
      tx
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(discountRules)
        .where(
          and(
            eq(discountRules.tenantId, input.tenantId),
            eq(discountRules.isActive, true),
            eq(discountRules.scopeType, 'customer'),
            eq(discountRules.customerId, input.customerId),
          ),
        ),
    ]);

    // Map privileges
    const privileges: PrivilegeExtendedEntry[] = privilegeRows.map((row) => ({
      id: row.id,
      privilegeType: row.privilegeType,
      value: (row.value ?? {}) as Record<string, unknown>,
      reason: row.reason ?? null,
      isActive: row.isActive,
      effectiveDate: row.effectiveDate ?? null,
      expirationDate: row.expirationDate ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      notes: row.notes ?? null,
    }));

    // Aggregate stored value summary
    let totalInstruments = 0;
    let totalBalanceCents = 0;
    const byType: StoredValueByType[] = svRows.map((row) => {
      const count = Number(row.count);
      const balanceCents = Number(row.balanceCents);
      totalInstruments += count;
      totalBalanceCents += balanceCents;
      return {
        instrumentType: row.instrumentType,
        count,
        balanceCents,
      };
    });

    const discountRuleCount = ruleCountResult[0]?.count ?? 0;

    return {
      privileges,
      storedValueSummary: {
        totalInstruments,
        totalBalanceCents,
        byType,
      },
      discountRuleCount,
    };
  });
}
