import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import {
  customers, customerRelationships, customerIdentifiers, customerActivityLog,
  customerMemberships, customerPrivileges, billingAccounts, billingAccountMembers,
  orders,
} from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { MergeCustomersInput } from '../validation';

export async function mergeCustomers(ctx: RequestContext, input: MergeCustomersInput) {
  if (input.primaryId === input.duplicateId) {
    throw new ValidationError('Cannot merge a customer with itself');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [primary] = await (tx as any).select().from(customers)
      .where(and(eq(customers.id, input.primaryId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!primary) throw new NotFoundError('Customer', input.primaryId);

    const [duplicate] = await (tx as any).select().from(customers)
      .where(and(eq(customers.id, input.duplicateId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!duplicate) throw new NotFoundError('Customer', input.duplicateId);

    // Merge fields: take primary's value unless null, then fall back to duplicate
    const mergedFields: string[] = [];
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      totalVisits: primary.totalVisits + duplicate.totalVisits,
      totalSpend: Number(primary.totalSpend) + Number(duplicate.totalSpend),
    };

    for (const field of ['email', 'phone', 'firstName', 'lastName', 'organizationName', 'notes'] as const) {
      if (!primary[field] && duplicate[field]) {
        (updates as any)[field] = duplicate[field];
        mergedFields.push(field);
      }
    }

    // Update primary customer
    await (tx as any).update(customers).set(updates).where(eq(customers.id, input.primaryId));

    // Reassign orders referencing duplicate -> primary
    await (tx as any).update(orders).set({ customerId: input.primaryId })
      .where(and(eq(orders.tenantId, ctx.tenantId), eq(orders.customerId, input.duplicateId)));

    // Reassign memberships
    await (tx as any).update(customerMemberships).set({ customerId: input.primaryId })
      .where(and(eq(customerMemberships.tenantId, ctx.tenantId), eq(customerMemberships.customerId, input.duplicateId)));

    // Reassign relationships (both parent and child)
    await (tx as any).update(customerRelationships).set({ parentCustomerId: input.primaryId })
      .where(and(eq(customerRelationships.tenantId, ctx.tenantId), eq(customerRelationships.parentCustomerId, input.duplicateId)));
    await (tx as any).update(customerRelationships).set({ childCustomerId: input.primaryId })
      .where(and(eq(customerRelationships.tenantId, ctx.tenantId), eq(customerRelationships.childCustomerId, input.duplicateId)));

    // Reassign privileges
    await (tx as any).update(customerPrivileges).set({ customerId: input.primaryId })
      .where(and(eq(customerPrivileges.tenantId, ctx.tenantId), eq(customerPrivileges.customerId, input.duplicateId)));

    // Reassign billing account members
    await (tx as any).update(billingAccountMembers).set({ customerId: input.primaryId })
      .where(and(eq(billingAccountMembers.tenantId, ctx.tenantId), eq(billingAccountMembers.customerId, input.duplicateId)));

    // Reassign identifiers
    await (tx as any).update(customerIdentifiers).set({ customerId: input.primaryId })
      .where(and(eq(customerIdentifiers.tenantId, ctx.tenantId), eq(customerIdentifiers.customerId, input.duplicateId)));

    // Reassign activity log
    await (tx as any).update(customerActivityLog).set({ customerId: input.primaryId })
      .where(and(eq(customerActivityLog.tenantId, ctx.tenantId), eq(customerActivityLog.customerId, input.duplicateId)));

    // Update billing accounts where duplicate was primary customer
    await (tx as any).update(billingAccounts).set({ primaryCustomerId: input.primaryId })
      .where(and(eq(billingAccounts.tenantId, ctx.tenantId), eq(billingAccounts.primaryCustomerId, input.duplicateId)));

    // Soft-delete the duplicate (set type to indicate merged)
    await (tx as any).update(customers).set({
      displayName: `[MERGED] ${duplicate.displayName}`,
      metadata: { mergedInto: input.primaryId, mergedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(customers.id, input.duplicateId));

    // Activity log on primary
    await (tx as any).insert(customerActivityLog).values({
      tenantId: ctx.tenantId,
      customerId: input.primaryId,
      activityType: 'merge',
      title: `Merged with ${duplicate.displayName}`,
      metadata: { duplicateId: input.duplicateId, mergedFields },
      createdBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'customer.merged.v1', {
      primaryId: input.primaryId,
      duplicateId: input.duplicateId,
      mergedFields,
    });

    return { result: { primaryId: input.primaryId, duplicateId: input.duplicateId, mergedFields }, events: [event] };
  });

  await auditLog(ctx, 'customer.merged', 'customer', input.primaryId);
  return result;
}
