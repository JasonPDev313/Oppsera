import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { vendors } from '@oppsera/db';
import { eq, and, ne } from 'drizzle-orm';

export async function reactivateVendor(ctx: RequestContext, vendorId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await (tx as any)
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.id, vendorId)));
    if (!rows[0]) throw new NotFoundError('Vendor');

    // Re-check name uniqueness against active vendors (edge case: another vendor
    // with the same normalized name may have been created while this one was inactive)
    const dupes = await (tx as any)
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.tenantId, ctx.tenantId),
          eq(vendors.nameNormalized, rows[0].nameNormalized),
          eq(vendors.isActive, true),
          ne(vendors.id, vendorId),
        ),
      );
    if (dupes.length > 0) {
      throw new ValidationError(
        `Cannot reactivate: a vendor named '${rows[0].name}' already exists`,
      );
    }

    const [updated] = await (tx as any)
      .update(vendors)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(vendors.id, vendorId))
      .returning();

    const event = buildEventFromContext(ctx, 'inventory.vendor.reactivated.v1', {
      vendorId: updated.id,
      name: updated.name,
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'inventory.vendor.reactivated', 'vendor', vendorId);
  return result;
}
