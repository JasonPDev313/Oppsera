import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateCustomerInput } from '../validation';
import { computeDisplayName } from '../helpers/display-name';

export async function updateCustomer(ctx: RequestContext, customerId: string, input: UpdateCustomerInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Customer', customerId);

    // Check email uniqueness if changed
    if (input.email !== undefined && input.email !== existing.email) {
      if (input.email) {
        const [dup] = await (tx as any).select({ id: customers.id }).from(customers)
          .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.email, input.email)))
          .limit(1);
        if (dup && dup.id !== customerId) throw new ConflictError('Customer with this email already exists');
      }
    }

    // Check phone uniqueness if changed
    if (input.phone !== undefined && input.phone !== existing.phone) {
      if (input.phone) {
        const [dup] = await (tx as any).select({ id: customers.id }).from(customers)
          .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.phone, input.phone)))
          .limit(1);
        if (dup && dup.id !== customerId) throw new ConflictError('Customer with this phone already exists');
      }
    }

    // Build update object
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.email !== undefined) updates.email = input.email;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.firstName !== undefined) updates.firstName = input.firstName;
    if (input.lastName !== undefined) updates.lastName = input.lastName;
    if (input.organizationName !== undefined) updates.organizationName = input.organizationName;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.tags !== undefined) updates.tags = input.tags;
    if (input.marketingConsent !== undefined) updates.marketingConsent = input.marketingConsent;
    if (input.taxExempt !== undefined) updates.taxExempt = input.taxExempt;
    if (input.taxExemptCertificateNumber !== undefined) updates.taxExemptCertificateNumber = input.taxExemptCertificateNumber;

    // Recompute displayName if name fields changed
    if (input.firstName !== undefined || input.lastName !== undefined || input.organizationName !== undefined || input.displayName !== undefined) {
      const mergedForDisplay = {
        type: existing.type as 'person' | 'organization',
        firstName: input.firstName !== undefined ? input.firstName : existing.firstName,
        lastName: input.lastName !== undefined ? input.lastName : existing.lastName,
        organizationName: input.organizationName !== undefined ? input.organizationName : existing.organizationName,
        email: input.email !== undefined ? input.email : existing.email,
        phone: input.phone !== undefined ? input.phone : existing.phone,
      };
      updates.displayName = input.displayName ?? computeDisplayName(mergedForDisplay);
    }

    const [updated] = await (tx as any).update(customers).set(updates)
      .where(eq(customers.id, customerId)).returning();

    const changes = computeChanges(existing, updated!);

    const event = buildEventFromContext(ctx, 'customer.updated.v1', {
      customerId,
      changes,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.updated', 'customer', customerId);
  return result;
}
