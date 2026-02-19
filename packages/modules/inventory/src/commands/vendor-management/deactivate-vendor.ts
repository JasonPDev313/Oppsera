import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { vendors } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export async function deactivateVendor(ctx: RequestContext, vendorId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await (tx as any)
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.id, vendorId)));
    if (!rows[0]) throw new NotFoundError('Vendor');

    const [updated] = await (tx as any)
      .update(vendors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vendors.id, vendorId))
      .returning();

    const event = buildEventFromContext(ctx, 'inventory.vendor.deactivated.v1', {
      vendorId: updated.id,
      name: updated.name,
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'inventory.vendor.deactivated', 'vendor', vendorId);
  return result;
}
