import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { customers, customerSegments, customerSegmentMemberships } from '@oppsera/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type { CreateSegmentInput, AddToSegmentInput, RemoveFromSegmentInput } from '../validation';

export async function createSegment(ctx: RequestContext, input: CreateSegmentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [created] = await (tx as any).insert(customerSegments).values({
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? null,
      segmentType: input.segmentType ?? 'manual',
      rules: input.rules ?? null,
      createdBy: ctx.user.id,
    }).returning();

    const event = buildEventFromContext(ctx, 'customer_segment.created.v1', {
      segmentId: created!.id,
      name: input.name,
      segmentType: input.segmentType ?? 'manual',
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.segment_created', 'customer_segment', result.id);
  return result;
}

export async function addToSegment(ctx: RequestContext, input: AddToSegmentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify segment exists
    const [segment] = await (tx as any).select({ id: customerSegments.id }).from(customerSegments)
      .where(and(eq(customerSegments.id, input.segmentId), eq(customerSegments.tenantId, ctx.tenantId)))
      .limit(1);
    if (!segment) throw new NotFoundError('Segment', input.segmentId);

    // Verify customer exists
    const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    // Check no active membership
    const [existing] = await (tx as any).select({ id: customerSegmentMemberships.id }).from(customerSegmentMemberships)
      .where(and(
        eq(customerSegmentMemberships.tenantId, ctx.tenantId),
        eq(customerSegmentMemberships.segmentId, input.segmentId),
        eq(customerSegmentMemberships.customerId, input.customerId),
        isNull(customerSegmentMemberships.removedAt),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Customer is already in this segment');

    const [created] = await (tx as any).insert(customerSegmentMemberships).values({
      tenantId: ctx.tenantId,
      segmentId: input.segmentId,
      customerId: input.customerId,
      addedBy: ctx.user.id,
    }).returning();

    // Increment segment member count
    await (tx as any).update(customerSegments).set({
      memberCount: sql`${customerSegments.memberCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(customerSegments.id, input.segmentId));

    const event = buildEventFromContext(ctx, 'customer_segment_member.added.v1', {
      segmentId: input.segmentId,
      customerId: input.customerId,
      membershipId: created!.id,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.segment_member_added', 'customer', input.customerId);
  return result;
}

export async function removeFromSegment(ctx: RequestContext, input: RemoveFromSegmentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find active membership
    const [membership] = await (tx as any).select().from(customerSegmentMemberships)
      .where(and(
        eq(customerSegmentMemberships.tenantId, ctx.tenantId),
        eq(customerSegmentMemberships.segmentId, input.segmentId),
        eq(customerSegmentMemberships.customerId, input.customerId),
        isNull(customerSegmentMemberships.removedAt),
      ))
      .limit(1);
    if (!membership) throw new NotFoundError('Segment membership', `${input.segmentId}/${input.customerId}`);

    // Soft-remove: set removedAt
    const [updated] = await (tx as any).update(customerSegmentMemberships).set({
      removedAt: new Date(),
    }).where(eq(customerSegmentMemberships.id, membership.id)).returning();

    // Decrement segment member count
    await (tx as any).update(customerSegments).set({
      memberCount: sql`member_count - 1`,
      updatedAt: new Date(),
    }).where(eq(customerSegments.id, input.segmentId));

    const event = buildEventFromContext(ctx, 'customer_segment_member.removed.v1', {
      segmentId: input.segmentId,
      customerId: input.customerId,
      membershipId: membership.id,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.segment_member_removed', 'customer', input.customerId);
  return result;
}
