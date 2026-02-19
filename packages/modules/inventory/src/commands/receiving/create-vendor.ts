import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { ValidationError } from '@oppsera/shared';
import { vendors } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { normalizeVendorName } from '../../services/vendor-name';
import type { CreateVendorInput } from '../../validation/receiving';

export async function createVendor(
  ctx: RequestContext,
  input: CreateVendorInput,
) {
  const nameNormalized = normalizeVendorName(input.name);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for duplicate name (Rule VM-2)
    const existing = await (tx as any)
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.nameNormalized, nameNormalized)));
    if (existing.length > 0) {
      throw new ValidationError(`A vendor named '${input.name.trim()}' already exists`);
    }

    const [created] = await (tx as any)
      .insert(vendors)
      .values({
        tenantId: ctx.tenantId,
        name: input.name.trim(),
        nameNormalized,
        accountNumber: input.accountNumber ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        paymentTerms: input.paymentTerms ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        taxId: input.taxId ?? null,
        notes: input.notes ?? null,
        website: (input as any).website ?? null,
        defaultPaymentTerms: (input as any).defaultPaymentTerms ?? null,
      })
      .returning();

    const vendor = created!;
    const event = buildEventFromContext(ctx, 'inventory.vendor.created.v1', {
      vendorId: vendor.id,
      name: vendor.name,
    });

    return { result: vendor, events: [event] };
  });

  await auditLog(ctx, 'inventory.vendor.created', 'vendor', result.id);
  return result;
}
