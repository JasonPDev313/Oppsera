import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerPreferences } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { DeleteCustomerPreferenceInput } from '../validation';

export async function deleteCustomerPreference(ctx: RequestContext, input: DeleteCustomerPreferenceInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Verify preference exists for tenant
    const [existing] = await (tx as any).select().from(customerPreferences)
      .where(and(eq(customerPreferences.id, input.preferenceId), eq(customerPreferences.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Customer preference', input.preferenceId);

    // Delete it
    await (tx as any).delete(customerPreferences)
      .where(eq(customerPreferences.id, input.preferenceId));

    return existing!;
  });

  await auditLog(ctx, 'customer.preference_deleted', 'customer_preference', input.preferenceId);
  return result;
}
