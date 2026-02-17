import { eq, and, or, gt, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customerPrivileges,
  customerMemberships,
  membershipPlans,
} from '@oppsera/db';

export interface GetCustomerPrivilegesInput {
  tenantId: string;
  customerId: string;
}

export interface PrivilegeEntry {
  privilegeType: string;
  value: unknown;
  source: 'manual' | 'membership';
  sourceId: string;
  reason?: string | null;
  expiresAt?: Date | null;
}

export async function getCustomerPrivileges(
  input: GetCustomerPrivilegesInput,
): Promise<PrivilegeEntry[]> {
  return withTenant(input.tenantId, async (tx) => {
    const now = new Date();

    // Manual privileges (filter out expired)
    const manualPrivileges = await tx
      .select()
      .from(customerPrivileges)
      .where(
        and(
          eq(customerPrivileges.tenantId, input.tenantId),
          eq(customerPrivileges.customerId, input.customerId),
          or(
            isNull(customerPrivileges.expiresAt),
            gt(customerPrivileges.expiresAt, now),
          ),
        ),
      );

    const result: PrivilegeEntry[] = manualPrivileges.map((p) => ({
      privilegeType: p.privilegeType,
      value: p.value,
      source: 'manual' as const,
      sourceId: p.id,
      reason: p.reason,
      expiresAt: p.expiresAt,
    }));

    // Membership privileges from active memberships' plans
    const activeMemberships = await tx
      .select({
        membershipId: customerMemberships.id,
        privileges: membershipPlans.privileges,
      })
      .from(customerMemberships)
      .innerJoin(membershipPlans, eq(customerMemberships.planId, membershipPlans.id))
      .where(
        and(
          eq(customerMemberships.tenantId, input.tenantId),
          eq(customerMemberships.customerId, input.customerId),
          eq(customerMemberships.status, 'active'),
        ),
      );

    for (const membership of activeMemberships) {
      const privileges = membership.privileges as Array<{
        privilegeType: string;
        value: unknown;
      }>;
      if (Array.isArray(privileges)) {
        for (const priv of privileges) {
          result.push({
            privilegeType: priv.privilegeType,
            value: priv.value,
            source: 'membership',
            sourceId: membership.membershipId,
          });
        }
      }
    }

    return result;
  });
}
