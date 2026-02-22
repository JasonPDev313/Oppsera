import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { autopayProfiles } from '@oppsera/db';

export interface GetAutopayProfileInput {
  tenantId: string;
  membershipAccountId: string;
}

export interface AutopayProfileData {
  id: string;
  membershipAccountId: string;
  paymentMethodId: string | null;
  strategy: string;
  fixedAmountCents: number;
  selectedAccountTypes: string[] | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export async function getAutopayProfile(
  input: GetAutopayProfileInput,
): Promise<AutopayProfileData | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await (tx as any)
      .select({
        id: autopayProfiles.id,
        membershipAccountId: autopayProfiles.membershipAccountId,
        paymentMethodId: autopayProfiles.paymentMethodId,
        strategy: autopayProfiles.strategy,
        fixedAmountCents: autopayProfiles.fixedAmountCents,
        selectedAccountTypes: autopayProfiles.selectedAccountTypes,
        isActive: autopayProfiles.isActive,
        lastRunAt: autopayProfiles.lastRunAt,
        nextRunAt: autopayProfiles.nextRunAt,
      })
      .from(autopayProfiles)
      .where(
        and(
          eq(autopayProfiles.tenantId, input.tenantId),
          eq(autopayProfiles.membershipAccountId, input.membershipAccountId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      membershipAccountId: String(row.membershipAccountId),
      paymentMethodId: row.paymentMethodId ? String(row.paymentMethodId) : null,
      strategy: String(row.strategy),
      fixedAmountCents: Number(row.fixedAmountCents ?? 0),
      selectedAccountTypes: Array.isArray(row.selectedAccountTypes)
        ? (row.selectedAccountTypes as string[])
        : null,
      isActive: Boolean(row.isActive),
      lastRunAt: row.lastRunAt instanceof Date
        ? row.lastRunAt.toISOString()
        : (row.lastRunAt ? String(row.lastRunAt) : null),
      nextRunAt: row.nextRunAt instanceof Date
        ? row.nextRunAt.toISOString()
        : (row.nextRunAt ? String(row.nextRunAt) : null),
    };
  });
}
