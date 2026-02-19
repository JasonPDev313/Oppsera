import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { vendors } from '@oppsera/db';
import { eq, and, ne } from 'drizzle-orm';
import { normalizeVendorName } from '../../services/vendor-name';
import type { UpdateVendorInput } from '../../validation/receiving';

export async function updateVendor(
  ctx: RequestContext,
  input: UpdateVendorInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await (tx as any)
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.id, input.vendorId)));
    if (!rows[0]) throw new NotFoundError('Vendor');

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    // If name changed, recompute nameNormalized and check for duplicates (Rule VM-2)
    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      const nameNormalized = normalizeVendorName(trimmedName);
      const dupes = await (tx as any)
        .select({ id: vendors.id })
        .from(vendors)
        .where(
          and(
            eq(vendors.tenantId, ctx.tenantId),
            eq(vendors.nameNormalized, nameNormalized),
            ne(vendors.id, input.vendorId),
          ),
        );
      if (dupes.length > 0) {
        throw new ValidationError(`A vendor named '${trimmedName}' already exists`);
      }
      updates.name = trimmedName;
      updates.nameNormalized = nameNormalized;
    }

    if (input.accountNumber !== undefined) updates.accountNumber = input.accountNumber;
    if (input.contactName !== undefined) updates.contactName = input.contactName;
    if (input.contactEmail !== undefined) updates.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) updates.contactPhone = input.contactPhone;
    if (input.paymentTerms !== undefined) updates.paymentTerms = input.paymentTerms;
    if (input.addressLine1 !== undefined) updates.addressLine1 = input.addressLine1;
    if (input.addressLine2 !== undefined) updates.addressLine2 = input.addressLine2;
    if (input.city !== undefined) updates.city = input.city;
    if (input.state !== undefined) updates.state = input.state;
    if (input.postalCode !== undefined) updates.postalCode = input.postalCode;
    if (input.country !== undefined) updates.country = input.country;
    if (input.taxId !== undefined) updates.taxId = input.taxId;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if ((input as any).website !== undefined) updates.website = (input as any).website;
    if ((input as any).defaultPaymentTerms !== undefined) updates.defaultPaymentTerms = (input as any).defaultPaymentTerms;

    const [updated] = await (tx as any)
      .update(vendors)
      .set(updates)
      .where(eq(vendors.id, input.vendorId))
      .returning();

    const event = buildEventFromContext(ctx, 'inventory.vendor.updated.v1', {
      vendorId: updated.id,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'inventory.vendor.updated', 'vendor', input.vendorId);
  return result;
}
