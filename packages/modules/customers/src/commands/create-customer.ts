import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { ValidationError, ConflictError } from '@oppsera/shared';
import { customers, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateCustomerInput } from '../validation';
import { computeDisplayName } from '../helpers/display-name';

export async function createCustomer(ctx: RequestContext, input: CreateCustomerInput) {
  // At least one identifying field required
  if (!input.email && !input.phone && !input.firstName && !input.organizationName) {
    throw new ValidationError('At least one of email, phone, firstName, or organizationName is required');
  }

  const displayName = computeDisplayName(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check email uniqueness
    if (input.email) {
      const [existing] = await (tx as any).select({ id: customers.id }).from(customers)
        .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.email, input.email)))
        .limit(1);
      if (existing) throw new ConflictError('Customer with this email already exists');
    }

    // Check phone uniqueness
    if (input.phone) {
      const [existing] = await (tx as any).select({ id: customers.id }).from(customers)
        .where(and(eq(customers.tenantId, ctx.tenantId), eq(customers.phone, input.phone)))
        .limit(1);
      if (existing) throw new ConflictError('Customer with this phone already exists');
    }

    const [created] = await (tx as any).insert(customers).values({
      tenantId: ctx.tenantId,
      type: input.type ?? 'person',
      email: input.email ?? null,
      phone: input.phone ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      organizationName: input.organizationName ?? null,
      displayName,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      marketingConsent: input.marketingConsent ?? false,
      taxExempt: input.taxExempt ?? false,
      taxExemptCertificateNumber: input.taxExemptCertificateNumber ?? null,
      createdBy: ctx.user.id,
    }).returning();

    // Activity log
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: created!.id,
      activityType: 'system',
      title: 'Customer created',
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.created.v1', {
      customerId: created!.id,
      type: created!.type,
      displayName: created!.displayName,
      email: created!.email ?? undefined,
      phone: created!.phone ?? undefined,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.created', 'customer', result.id);
  return result;
}
