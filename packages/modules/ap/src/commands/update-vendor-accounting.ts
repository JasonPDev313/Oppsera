import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { vendors, glAccounts } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { InvalidAccountReferenceError } from '../errors';
import type { UpdateVendorAccountingInput } from '../validation';

export async function updateVendorAccounting(
  ctx: RequestContext,
  vendorId: string,
  input: UpdateVendorAccountingInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load vendor
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.id, vendorId),
          eq(vendors.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!vendor) {
      throw new NotFoundError('Vendor', vendorId);
    }

    // 2. Validate account references if provided
    if (input.defaultExpenseAccountId && input.defaultExpenseAccountId !== null) {
      const [account] = await tx
        .select({ id: glAccounts.id, isActive: glAccounts.isActive })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.id, input.defaultExpenseAccountId),
            eq(glAccounts.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!account || !account.isActive) {
        throw new InvalidAccountReferenceError('defaultExpenseAccountId', input.defaultExpenseAccountId);
      }
    }

    if (input.defaultAPAccountId && input.defaultAPAccountId !== null) {
      const [account] = await tx
        .select({ id: glAccounts.id, isActive: glAccounts.isActive })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.id, input.defaultAPAccountId),
            eq(glAccounts.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!account || !account.isActive) {
        throw new InvalidAccountReferenceError('defaultAPAccountId', input.defaultAPAccountId);
      }
    }

    // 3. Build update set
    const updateSet: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.vendorNumber !== undefined) updateSet.vendorNumber = input.vendorNumber;
    if (input.defaultExpenseAccountId !== undefined) updateSet.defaultExpenseAccountId = input.defaultExpenseAccountId;
    if (input.defaultAPAccountId !== undefined) updateSet.defaultAPAccountId = input.defaultAPAccountId;
    if (input.paymentTermsId !== undefined) updateSet.paymentTermsId = input.paymentTermsId;
    if (input.is1099Eligible !== undefined) updateSet.is1099Eligible = input.is1099Eligible;

    // 4. Update vendor
    const [updated] = await tx
      .update(vendors)
      .set(updateSet)
      .where(eq(vendors.id, vendorId))
      .returning();

    return {
      result: updated!,
      events: [], // No domain event for vendor accounting config update
    };
  });

  await auditLog(ctx, 'ap.vendor.accounting_updated', 'vendor', result.id);
  return result;
}
