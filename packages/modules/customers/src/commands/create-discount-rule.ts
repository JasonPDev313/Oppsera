import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { discountRules, customers, customerSegments } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateDiscountRuleInput } from '../validation';

/**
 * Creates a new discount rule.
 *
 * Validates scope references (customerId, segmentId) exist when provided.
 * Validates rule structure and priority.
 */
export async function createDiscountRule(ctx: RequestContext, input: CreateDiscountRuleInput) {
  const scopeType = input.scopeType ?? 'global';

  // Validate scope references match scopeType
  if (scopeType === 'customer' && !input.customerId) {
    throw new ValidationError('customerId is required when scopeType is "customer"');
  }
  if (scopeType === 'segment' && !input.segmentId) {
    throw new ValidationError('segmentId is required when scopeType is "segment"');
  }
  if (scopeType === 'membership_class' && !input.membershipClassId) {
    throw new ValidationError('membershipClassId is required when scopeType is "membership_class"');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate customer exists if scoped
    if (input.customerId) {
      const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
        .limit(1);
      if (!customer) throw new NotFoundError('Customer', input.customerId);
    }

    // Validate segment exists if scoped
    if (input.segmentId) {
      const [segment] = await (tx as any).select({ id: customerSegments.id }).from(customerSegments)
        .where(and(eq(customerSegments.id, input.segmentId), eq(customerSegments.tenantId, ctx.tenantId)))
        .limit(1);
      if (!segment) throw new NotFoundError('Segment', input.segmentId);
    }

    // Create discount rule
    const [created] = await (tx as any).insert(discountRules).values({
      tenantId: ctx.tenantId,
      scopeType,
      customerId: input.customerId ?? null,
      membershipClassId: input.membershipClassId ?? null,
      segmentId: input.segmentId ?? null,
      priority: input.priority ?? 100,
      name: input.name,
      description: input.description ?? null,
      isActive: true,
      effectiveDate: input.effectiveDate ?? null,
      expirationDate: input.expirationDate ?? null,
      ruleJson: input.ruleJson,
      createdBy: ctx.user.id,
    }).returning();

    const event = buildEventFromContext(ctx, 'customer.discount_rule.created.v1', {
      ruleId: created!.id,
      name: input.name,
      scopeType,
      customerId: input.customerId ?? null,
      segmentId: input.segmentId ?? null,
      membershipClassId: input.membershipClassId ?? null,
      priority: input.priority ?? 100,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.discount_rule.created', 'discount_rule', result.id);
  return result;
}
