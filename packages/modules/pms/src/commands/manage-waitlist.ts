import { eq, and, lte, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { pmsWaitlist, pmsWaitlistConfig, pmsRoomTypes, pmsGuests } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { addToWaitlistSchema, updateWaitlistConfigSchema } from '../validation';
import type { AddToWaitlistInput, UpdateWaitlistConfigInput } from '../validation';
import { generateUlid } from '@oppsera/shared';

// ── Add to Waitlist ─────────────────────────────────────────────

export async function addToWaitlist(ctx: RequestContext, input: AddToWaitlistInput) {
  const parsed = addToWaitlistSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, parsed.clientRequestId, 'pms.addToWaitlist');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as Record<string, unknown>, events: [] };

    // Validate room type if specified
    if (parsed.roomTypeId) {
      const [rt] = await tx
        .select({ id: pmsRoomTypes.id })
        .from(pmsRoomTypes)
        .where(and(eq(pmsRoomTypes.tenantId, ctx.tenantId), eq(pmsRoomTypes.id, parsed.roomTypeId)))
        .limit(1);
      if (!rt) throw new AppError('NOT_FOUND', `Room type not found: ${parsed.roomTypeId}`, 404);
    }

    // Validate guest if specified
    if (parsed.guestId) {
      const [guest] = await tx
        .select({ id: pmsGuests.id })
        .from(pmsGuests)
        .where(and(eq(pmsGuests.tenantId, ctx.tenantId), eq(pmsGuests.id, parsed.guestId)))
        .limit(1);
      if (!guest) throw new AppError('NOT_FOUND', `Guest not found: ${parsed.guestId}`, 404);
    }

    // Check duplicate: same guest/email waiting for same room type + dates
    if (parsed.guestId || parsed.guestEmail) {
      const dupConditions = [
        eq(pmsWaitlist.tenantId, ctx.tenantId),
        eq(pmsWaitlist.propertyId, parsed.propertyId),
        eq(pmsWaitlist.status, 'waiting'),
      ];
      if (parsed.guestId) dupConditions.push(eq(pmsWaitlist.guestId, parsed.guestId));
      if (parsed.guestEmail) dupConditions.push(eq(pmsWaitlist.guestEmail, parsed.guestEmail));

      const [dup] = await tx
        .select({ id: pmsWaitlist.id })
        .from(pmsWaitlist)
        .where(and(...dupConditions))
        .limit(1);
      if (dup) throw new AppError('VALIDATION_ERROR', 'Guest already has an active waitlist entry for this property', 400);
    }

    // Snapshot rate if available (rate lock)
    let rateLockCents: number | null = null;
    if (parsed.roomTypeId && parsed.checkInDate) {
      // Rate lock logic would query rate plans here in a real scenario.
      // For now, store null — front desk can set it manually.
      rateLockCents = null;
    }

    // Generate guest token for public tracking
    const guestToken = generateUlid();

    const [created] = await tx
      .insert(pmsWaitlist)
      .values({
        tenantId: ctx.tenantId,
        propertyId: parsed.propertyId,
        guestId: parsed.guestId ?? null,
        guestName: parsed.guestName ?? null,
        guestEmail: parsed.guestEmail ?? null,
        guestPhone: parsed.guestPhone ?? null,
        roomTypeId: parsed.roomTypeId ?? null,
        adults: parsed.adults,
        children: parsed.children,
        checkInDate: parsed.checkInDate ?? null,
        checkOutDate: parsed.checkOutDate ?? null,
        flexibility: parsed.flexibility,
        priority: parsed.priority,
        loyaltyTier: parsed.loyaltyTier ?? null,
        hasDeposit: parsed.hasDeposit,
        rateLockCents,
        ratePlanId: parsed.ratePlanId ?? null,
        notes: parsed.notes ?? null,
        source: parsed.source,
        guestToken,
        createdBy: ctx.user.id,
      })
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, parsed.clientRequestId, 'pms.addToWaitlist', created!);

    const event = buildEventFromContext(ctx, PMS_EVENTS.WAITLIST_ADDED, {
      waitlistId: created!.id,
      propertyId: parsed.propertyId,
      guestId: parsed.guestId,
      roomTypeId: parsed.roomTypeId,
      flexibility: parsed.flexibility,
      priority: parsed.priority,
    });

    return { result: created!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.waitlist.added', 'pms_waitlist', result.id as string);
  return result;
}

// ── Remove from Waitlist ────────────────────────────────────────

export async function removeFromWaitlist(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsWaitlist)
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .limit(1);

    if (!existing) throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    if (existing.status !== 'waiting' && existing.status !== 'offered') {
      throw new AppError('VALIDATION_ERROR', `Cannot remove entry with status: ${existing.status}`, 400);
    }

    const [updated] = await tx
      .update(pmsWaitlist)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.WAITLIST_CANCELED, {
      waitlistId: input.id,
      propertyId: existing.propertyId,
      guestId: existing.guestId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.waitlist.removed', 'pms_waitlist', result.id);
  return result;
}

// ── Offer a Slot ────────────────────────────────────────────────

export async function offerWaitlistSlot(
  ctx: RequestContext,
  input: { id: string; reservationId?: string; rateCents?: number; expiryHours?: number },
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsWaitlist)
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .limit(1);

    if (!existing) throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    if (existing.status !== 'waiting') {
      throw new AppError('VALIDATION_ERROR', `Cannot offer slot to entry with status: ${existing.status}`, 400);
    }

    // Get config for expiry duration
    const [config] = await tx
      .select({ offerExpiryHours: pmsWaitlistConfig.offerExpiryHours })
      .from(pmsWaitlistConfig)
      .where(and(eq(pmsWaitlistConfig.tenantId, ctx.tenantId), eq(pmsWaitlistConfig.propertyId, existing.propertyId)))
      .limit(1);

    const expiryHours = input.expiryHours ?? config?.offerExpiryHours ?? 24;
    const offerExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const [updated] = await tx
      .update(pmsWaitlist)
      .set({
        status: 'offered',
        offeredReservationId: input.reservationId ?? null,
        offeredRateCents: input.rateCents ?? existing.rateLockCents ?? null,
        offerExpiresAt,
        notifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.WAITLIST_OFFERED, {
      waitlistId: updated!.id,
      propertyId: existing.propertyId,
      guestId: existing.guestId,
      roomTypeId: existing.roomTypeId,
      offeredRateCents: input.rateCents ?? null,
      expiresAt: offerExpiresAt.toISOString(),
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.waitlist.offered', 'pms_waitlist', result.id);
  return result;
}

// ── Accept Offer ────────────────────────────────────────────────

export async function acceptWaitlistOffer(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsWaitlist)
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .limit(1);

    if (!existing) throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    if (existing.status !== 'offered') {
      throw new AppError('VALIDATION_ERROR', `Cannot accept entry with status: ${existing.status}`, 400);
    }

    // Check if offer expired
    if (existing.offerExpiresAt && existing.offerExpiresAt < new Date()) {
      throw new AppError('VALIDATION_ERROR', 'Offer has expired', 400);
    }

    const [updated] = await tx
      .update(pmsWaitlist)
      .set({ status: 'booked', bookedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.WAITLIST_ACCEPTED, {
      waitlistId: updated!.id,
      propertyId: existing.propertyId,
      guestId: existing.guestId,
      roomTypeId: existing.roomTypeId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.waitlist.accepted', 'pms_waitlist', result.id);
  return result;
}

// ── Decline Offer ───────────────────────────────────────────────

export async function declineWaitlistOffer(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsWaitlist)
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .limit(1);

    if (!existing) throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    if (existing.status !== 'offered') {
      throw new AppError('VALIDATION_ERROR', `Cannot decline entry with status: ${existing.status}`, 400);
    }

    const [updated] = await tx
      .update(pmsWaitlist)
      .set({
        status: 'waiting',
        offeredReservationId: null,
        offeredRateCents: null,
        offerExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(pmsWaitlist.tenantId, ctx.tenantId), eq(pmsWaitlist.id, input.id)))
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.WAITLIST_DECLINED, {
      waitlistId: updated!.id,
      propertyId: existing.propertyId,
      guestId: existing.guestId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.waitlist.declined', 'pms_waitlist', result.id);
  return result;
}

// ── Expire Stale Offers ─────────────────────────────────────────

export async function expireWaitlistOffers(ctx: RequestContext, input: { propertyId: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const now = new Date();

    // Atomically expire only entries whose offer has actually passed expiry
    const expired = await tx
      .update(pmsWaitlist)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          eq(pmsWaitlist.tenantId, ctx.tenantId),
          eq(pmsWaitlist.propertyId, input.propertyId),
          eq(pmsWaitlist.status, 'offered'),
          lte(pmsWaitlist.offerExpiresAt, now),
        ),
      )
      .returning();

    const events = expired.map((entry: { id: string; guestId: string | null }) =>
      buildEventFromContext(ctx, PMS_EVENTS.WAITLIST_EXPIRED, {
        waitlistId: entry.id,
        propertyId: input.propertyId,
        guestId: entry.guestId,
      }),
    );

    return { result: { expiredCount: expired.length }, events };
  });

  return result;
}

// ── Update Waitlist Config ──────────────────────────────────────

export async function updateWaitlistConfig(ctx: RequestContext, input: UpdateWaitlistConfigInput) {
  const parsed = updateWaitlistConfigSchema.parse(input);
  const { propertyId, ...updates } = parsed;

  // Upsert: try update first, insert if not found
  const [existing] = await publishWithOutbox(ctx, async (tx) => {
    const [found] = await tx
      .select({ id: pmsWaitlistConfig.id })
      .from(pmsWaitlistConfig)
      .where(and(eq(pmsWaitlistConfig.tenantId, ctx.tenantId), eq(pmsWaitlistConfig.propertyId, propertyId)))
      .limit(1);

    if (found) {
      const [updated] = await tx
        .update(pmsWaitlistConfig)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(pmsWaitlistConfig.tenantId, ctx.tenantId), eq(pmsWaitlistConfig.propertyId, propertyId)))
        .returning();
      return { result: [updated!], events: [] };
    }

    const [created] = await tx
      .insert(pmsWaitlistConfig)
      .values({
        tenantId: ctx.tenantId,
        propertyId,
        ...updates,
      })
      .returning();
    return { result: [created!], events: [] };
  });

  auditLogDeferred(ctx, 'pms.waitlist.config_updated', 'pms_waitlist_config', existing!.id);
  return existing!;
}
