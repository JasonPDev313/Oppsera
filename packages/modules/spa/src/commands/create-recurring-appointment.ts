import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory, spaProviders, spaResources } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { detectConflicts } from '../helpers/conflict-detector';
import { appointmentItemSchema } from '../validation';
import type { AppointmentItemInput } from '../validation';

interface RecurrenceRule {
  /** Recurrence frequency: daily, weekly, biweekly, monthly */
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  /** Number of occurrences to create (max 52) */
  count: number;
  /** Specific days of week (0=Sun, 6=Sat) for weekly patterns */
  daysOfWeek?: number[];
  /** Day of month for monthly patterns (1-28) */
  dayOfMonth?: number;
}

interface CreateRecurringAppointmentInput {
  clientRequestId?: string;
  customerId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  locationId: string;
  providerId?: string;
  resourceId?: string;
  startAt: string;
  endAt: string;
  bookingSource?: string;
  bookingChannel?: string;
  notes?: string;
  internalNotes?: string;
  items: AppointmentItemInput[];
  recurrence: RecurrenceRule;
}

/**
 * Creates a series of recurring appointments based on a recurrence rule.
 *
 * Generates appointments for each occurrence in the recurrence pattern.
 * Skips occurrences that have scheduling conflicts (logs them in the result).
 * All appointments share the same recurrenceRule JSONB for series tracking.
 * Limited to a maximum of 52 occurrences.
 */
export async function createRecurringAppointment(ctx: RequestContext, input: CreateRecurringAppointmentInput) {
  if (!input.customerId && !input.guestName) {
    throw new AppError('VALIDATION_ERROR', 'Either customerId or guestName is required', 400);
  }

  if (input.recurrence.count < 1 || input.recurrence.count > 52) {
    throw new AppError('VALIDATION_ERROR', 'Recurrence count must be between 1 and 52', 400);
  }

  // Validate items
  const parsedItems = input.items.map((item) => appointmentItemSchema.parse(item));
  if (parsedItems.length < 1) {
    throw new AppError('VALIDATION_ERROR', 'At least one service item is required', 400);
  }

  // Calculate all occurrence dates
  const baseStart = new Date(input.startAt);
  const baseEnd = new Date(input.endAt);
  const durationMs = baseEnd.getTime() - baseStart.getTime();
  const itemOffsets = parsedItems.map((item) => ({
    startOffsetMs: new Date(item.startAt).getTime() - baseStart.getTime(),
    endOffsetMs: new Date(item.endAt).getTime() - baseStart.getTime(),
  }));

  const occurrenceDates = computeOccurrenceDates(baseStart, input.recurrence);

  const recurrenceRule: Record<string, unknown> = {
    frequency: input.recurrence.frequency,
    count: input.recurrence.count,
    daysOfWeek: input.recurrence.daysOfWeek,
    dayOfMonth: input.recurrence.dayOfMonth,
    seriesStartAt: input.startAt,
  };

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createRecurringAppointment');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate provider exists if specified
    if (input.providerId) {
      const [provider] = await tx
        .select({ id: spaProviders.id, isActive: spaProviders.isActive })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.tenantId, ctx.tenantId),
            eq(spaProviders.id, input.providerId),
          ),
        )
        .limit(1);

      if (!provider) {
        throw new AppError('NOT_FOUND', `Provider not found: ${input.providerId}`, 404);
      }
      if (!provider.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Provider is not active', 400);
      }
    }

    // Validate resource exists if specified
    if (input.resourceId) {
      const [resource] = await tx
        .select({ id: spaResources.id, isActive: spaResources.isActive })
        .from(spaResources)
        .where(
          and(
            eq(spaResources.tenantId, ctx.tenantId),
            eq(spaResources.id, input.resourceId),
          ),
        )
        .limit(1);

      if (!resource) {
        throw new AppError('NOT_FOUND', `Resource not found: ${input.resourceId}`, 404);
      }
      if (!resource.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Resource is not active', 400);
      }
    }

    // Get current appointment count for numbering
    const [counterRow] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(spaAppointments)
      .where(eq(spaAppointments.tenantId, ctx.tenantId));

    let seqBase = (counterRow?.count ?? 0) + 1;

    const createdAppointments: Array<Record<string, unknown>> = [];
    const skippedOccurrences: Array<{ date: string; reason: string }> = [];
    const events: Array<ReturnType<typeof buildEventFromContext>> = [];

    for (const occurrenceStart of occurrenceDates) {
      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);

      // Run conflict detection for each occurrence
      const primaryProviderId = input.providerId ?? parsedItems[0]?.providerId;
      let hasConflict = false;

      if (primaryProviderId) {
        const itemResourceIds = parsedItems
          .map((item) => item.resourceId)
          .filter((id): id is string => !!id);

        const conflicts = await detectConflicts({
          tenantId: ctx.tenantId,
          providerId: primaryProviderId,
          startTime: occurrenceStart,
          endTime: occurrenceEnd,
          locationId: input.locationId,
          customerId: input.customerId,
          resourceIds: input.resourceId
            ? [input.resourceId, ...itemResourceIds]
            : itemResourceIds,
        });

        if (conflicts.hasConflicts) {
          skippedOccurrences.push({
            date: occurrenceStart.toISOString(),
            reason: conflicts.conflicts.map((c) => c.description).join('; '),
          });
          hasConflict = true;
        }
      }

      if (hasConflict) continue;

      // Generate appointment number
      const dateStr = occurrenceStart.toISOString().slice(0, 10).replace(/-/g, '');
      const seqNum = seqBase.toString().padStart(4, '0');
      const appointmentNumber = `SPA-${dateStr}-${seqNum}`;
      seqBase++;

      // Insert appointment
      const [created] = await tx
        .insert(spaAppointments)
        .values({
          tenantId: ctx.tenantId,
          appointmentNumber,
          customerId: input.customerId ?? null,
          guestName: input.guestName ?? null,
          guestEmail: input.guestEmail ?? null,
          guestPhone: input.guestPhone ?? null,
          locationId: input.locationId,
          providerId: input.providerId ?? null,
          resourceId: input.resourceId ?? null,
          startAt: occurrenceStart,
          endAt: occurrenceEnd,
          status: 'scheduled',
          bookingSource: input.bookingSource ?? 'front_desk',
          bookingChannel: input.bookingChannel ?? null,
          notes: input.notes ?? null,
          internalNotes: input.internalNotes ?? null,
          recurrenceRule,
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        })
        .returning();

      // Insert appointment items with shifted times
      const itemValues = parsedItems.map((item, idx) => ({
        tenantId: ctx.tenantId,
        appointmentId: created!.id,
        serviceId: item.serviceId,
        addonId: item.addonId ?? null,
        providerId: item.providerId ?? input.providerId ?? null,
        resourceId: item.resourceId ?? input.resourceId ?? null,
        startAt: new Date(occurrenceStart.getTime() + itemOffsets[idx]!.startOffsetMs),
        endAt: new Date(occurrenceStart.getTime() + itemOffsets[idx]!.endOffsetMs),
        priceCents: item.priceCents,
        memberPriceCents: item.memberPriceCents ?? null,
        finalPriceCents: item.finalPriceCents,
        discountAmountCents: item.discountAmountCents ?? 0,
        discountReason: item.discountReason ?? null,
        packageBalanceId: item.packageBalanceId ?? null,
        notes: item.notes ?? null,
        status: 'scheduled',
        sortOrder: idx,
      }));

      await tx.insert(spaAppointmentItems).values(itemValues);

      // Record history
      await tx.insert(spaAppointmentHistory).values({
        tenantId: ctx.tenantId,
        appointmentId: created!.id,
        action: 'created',
        newStatus: 'scheduled',
        changes: { recurring: true, frequency: input.recurrence.frequency },
        performedBy: ctx.user.id,
      });

      createdAppointments.push(created!);

      events.push(
        buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_CREATED, {
          appointmentId: created!.id,
          appointmentNumber,
          customerId: input.customerId,
          providerId: input.providerId,
          locationId: input.locationId,
          startAt: occurrenceStart.toISOString(),
          endAt: occurrenceEnd.toISOString(),
          bookingSource: input.bookingSource ?? 'front_desk',
          isRecurring: true,
          recurrenceFrequency: input.recurrence.frequency,
        }),
      );
    }

    // Save idempotency key
    const resultPayload = {
      appointments: createdAppointments,
      skippedOccurrences,
      totalCreated: createdAppointments.length,
      totalSkipped: skippedOccurrences.length,
    };

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createRecurringAppointment', resultPayload);

    return { result: resultPayload, events };
  });

  await auditLog(ctx, 'spa.appointment.recurring_created', 'spa_appointment_series', result.totalCreated?.toString() ?? '0');

  return result;
}

/**
 * Computes occurrence dates from a start date and recurrence rule.
 */
function computeOccurrenceDates(baseStart: Date, rule: RecurrenceRule): Date[] {
  const dates: Date[] = [];

  for (let i = 0; i < rule.count; i++) {
    const occurrence = new Date(baseStart);

    switch (rule.frequency) {
      case 'daily':
        occurrence.setDate(occurrence.getDate() + i);
        break;

      case 'weekly':
        occurrence.setDate(occurrence.getDate() + i * 7);
        break;

      case 'biweekly':
        occurrence.setDate(occurrence.getDate() + i * 14);
        break;

      case 'monthly':
        occurrence.setMonth(occurrence.getMonth() + i);
        // If dayOfMonth is specified, use it (clamped to month length)
        if (rule.dayOfMonth) {
          const maxDay = new Date(occurrence.getFullYear(), occurrence.getMonth() + 1, 0).getDate();
          occurrence.setDate(Math.min(rule.dayOfMonth, maxDay));
        }
        break;
    }

    dates.push(occurrence);
  }

  return dates;
}
