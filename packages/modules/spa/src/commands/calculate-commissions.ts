import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  spaAppointments,
  spaAppointmentItems,
  spaCommissionRules,
  spaCommissionLedger,
} from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import {
  computeAppointmentCommissions,
  type CommissionRule as CommissionRuleInput,
} from '../helpers/commission-engine';

// ── Input Types ──────────────────────────────────────────────────

interface CalculateAppointmentCommissionsInput {
  clientRequestId?: string;
  appointmentId: string;
  orderId?: string;
}

interface ApproveCommissionsInput {
  ids: string[];
  payPeriod?: string;
}

interface PayCommissionsInput {
  ids: string[];
}

// ── Commands ─────────────────────────────────────────────────────

/**
 * Calculates commissions for all items in an appointment.
 *
 * Fetches the appointment with its items, resolves commission rules,
 * runs the pure commission engine, and inserts results into the
 * commission ledger. Emits COMMISSION_CALCULATED event.
 */
export async function calculateAppointmentCommissions(
  ctx: RequestContext,
  input: CalculateAppointmentCommissionsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'calculateAppointmentCommissions',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Fetch appointment
    const [appointment] = await tx
      .select({
        id: spaAppointments.id,
        providerId: spaAppointments.providerId,
        startAt: spaAppointments.startAt,
        status: spaAppointments.status,
      })
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, ctx.tenantId),
          eq(spaAppointments.id, input.appointmentId),
        ),
      )
      .limit(1);

    if (!appointment) {
      throw new AppError('NOT_FOUND', `Appointment not found: ${input.appointmentId}`, 404);
    }

    if (!appointment.providerId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Appointment has no assigned provider — cannot calculate commissions',
        400,
      );
    }

    // Fetch appointment items
    const items = await tx
      .select({
        id: spaAppointmentItems.id,
        serviceId: spaAppointmentItems.serviceId,
        finalPriceCents: spaAppointmentItems.finalPriceCents,
      })
      .from(spaAppointmentItems)
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.appointmentId),
        ),
      );

    if (items.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Appointment has no items', 400);
    }

    // Fetch active commission rules for this tenant
    const dbRules = await tx
      .select()
      .from(spaCommissionRules)
      .where(
        and(
          eq(spaCommissionRules.tenantId, ctx.tenantId),
          eq(spaCommissionRules.isActive, true),
        ),
      );

    if (dbRules.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No active commission rules configured', 400);
    }

    // Map DB rules to the pure engine's input shape
    const rules: CommissionRuleInput[] = dbRules.map((r) => ({
      id: r.id,
      name: r.name,
      providerId: r.providerId,
      serviceId: r.serviceId,
      serviceCategory: r.serviceCategory,
      commissionType: r.commissionType as CommissionRuleInput['commissionType'],
      rate: r.rate != null ? Number(r.rate) : null,
      flatAmount: r.flatAmount != null ? Number(r.flatAmount) : null,
      tiers: r.tiers ?? null,
      appliesTo: r.appliesTo as CommissionRuleInput['appliesTo'],
      effectiveFrom: r.effectiveFrom,
      effectiveUntil: r.effectiveUntil,
      isActive: r.isActive,
      priority: r.priority,
    }));

    // Map appointment items to the engine's item format
    const engineItems = items.map((item) => ({
      serviceId: item.serviceId,
      serviceCategory: 'default' as const,
      priceCents: item.finalPriceCents,
      addonPriceCents: 0,
      tipCents: 0,
    }));

    // Format appointment date as YYYY-MM-DD
    const appointmentDate = appointment.startAt.toISOString().slice(0, 10);

    // Run the pure commission engine
    const summary = computeAppointmentCommissions(
      rules,
      engineItems,
      appointment.providerId,
      appointmentDate,
    );

    // Batch insert results into the ledger (one row per lineItem)
    const ledgerRows = summary.lineItems.map((lineItem, idx) => ({
      tenantId: ctx.tenantId,
      providerId: appointment.providerId!,
      appointmentId: input.appointmentId,
      appointmentItemId: items[idx]?.id ?? null,
      orderId: input.orderId ?? null,
      ruleId: lineItem.ruleId,
      commissionType: lineItem.commissionType,
      baseAmountCents: lineItem.baseAmountCents,
      commissionAmountCents: lineItem.commissionAmountCents,
      rateApplied: lineItem.rateApplied.toFixed(2),
      status: 'calculated' as const,
    }));

    let insertedRows: Array<{ id: string }> = [];
    if (ledgerRows.length > 0) {
      insertedRows = await tx
        .insert(spaCommissionLedger)
        .values(ledgerRows)
        .returning({ id: spaCommissionLedger.id });
    }

    // Save idempotency key
    if (input.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'calculateAppointmentCommissions',
        summary,
      );
    }

    const event = buildEventFromContext(ctx, SPA_EVENTS.COMMISSION_CALCULATED, {
      appointmentId: input.appointmentId,
      providerId: appointment.providerId,
      totalBaseAmountCents: summary.totalBaseAmountCents,
      totalCommissionCents: summary.totalCommissionCents,
      effectiveRate: summary.effectiveRate,
      lineItemCount: summary.lineItems.length,
      ledgerIds: insertedRows.map((r) => r.id),
    });

    return {
      result: {
        ...summary,
        appointmentId: input.appointmentId,
        ledgerIds: insertedRows.map((r) => r.id),
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'spa.commission.calculated', 'spa_appointment', input.appointmentId);

  return result;
}

/**
 * Approves one or more commission ledger entries.
 *
 * All entries must be in 'calculated' status. Transitions them to 'approved',
 * records the approver and optional pay period, and emits COMMISSION_APPROVED.
 */
export async function approveCommissions(ctx: RequestContext, input: ApproveCommissionsInput) {
  if (input.ids.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'No commission IDs provided', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch all entries
    const entries = await tx
      .select({
        id: spaCommissionLedger.id,
        status: spaCommissionLedger.status,
        providerId: spaCommissionLedger.providerId,
        commissionAmountCents: spaCommissionLedger.commissionAmountCents,
      })
      .from(spaCommissionLedger)
      .where(
        and(
          eq(spaCommissionLedger.tenantId, ctx.tenantId),
          inArray(spaCommissionLedger.id, input.ids),
        ),
      );

    if (entries.length !== input.ids.length) {
      const foundIds = new Set(entries.map((e) => e.id));
      const missing = input.ids.filter((id) => !foundIds.has(id));
      throw new AppError('NOT_FOUND', `Commission entries not found: ${missing.join(', ')}`, 404);
    }

    // Validate all entries are in 'calculated' status
    const invalidEntries = entries.filter((e) => e.status !== 'calculated');
    if (invalidEntries.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot approve entries not in 'calculated' status: ${invalidEntries.map((e) => e.id).join(', ')}`,
        400,
      );
    }

    const now = new Date();

    // Batch update status to approved
    await tx
      .update(spaCommissionLedger)
      .set({
        status: 'approved',
        approvedBy: ctx.user.id,
        approvedAt: now,
        payPeriod: input.payPeriod ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(spaCommissionLedger.tenantId, ctx.tenantId),
          inArray(spaCommissionLedger.id, input.ids),
        ),
      );

    const totalApprovedCents = entries.reduce(
      (sum, e) => sum + e.commissionAmountCents,
      0,
    );

    const event = buildEventFromContext(ctx, SPA_EVENTS.COMMISSION_APPROVED, {
      commissionIds: input.ids,
      approvedBy: ctx.user.id,
      payPeriod: input.payPeriod ?? null,
      count: input.ids.length,
      totalApprovedCents,
    });

    return {
      result: {
        approvedIds: input.ids,
        approvedBy: ctx.user.id,
        approvedAt: now.toISOString(),
        payPeriod: input.payPeriod ?? null,
        count: input.ids.length,
        totalApprovedCents,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'spa.commission.approved', 'spa_commission_ledger', input.ids.join(','));

  return result;
}

/**
 * Marks one or more approved commission ledger entries as paid.
 *
 * All entries must be in 'approved' status. Transitions them to 'paid'
 * and records the payment timestamp.
 */
export async function payCommissions(ctx: RequestContext, input: PayCommissionsInput) {
  if (input.ids.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'No commission IDs provided', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch all entries
    const entries = await tx
      .select({
        id: spaCommissionLedger.id,
        status: spaCommissionLedger.status,
        commissionAmountCents: spaCommissionLedger.commissionAmountCents,
      })
      .from(spaCommissionLedger)
      .where(
        and(
          eq(spaCommissionLedger.tenantId, ctx.tenantId),
          inArray(spaCommissionLedger.id, input.ids),
        ),
      );

    if (entries.length !== input.ids.length) {
      const foundIds = new Set(entries.map((e) => e.id));
      const missing = input.ids.filter((id) => !foundIds.has(id));
      throw new AppError('NOT_FOUND', `Commission entries not found: ${missing.join(', ')}`, 404);
    }

    // Validate all entries are in 'approved' status
    const invalidEntries = entries.filter((e) => e.status !== 'approved');
    if (invalidEntries.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot pay entries not in 'approved' status: ${invalidEntries.map((e) => e.id).join(', ')}`,
        400,
      );
    }

    const now = new Date();

    // Batch update status to paid
    await tx
      .update(spaCommissionLedger)
      .set({
        status: 'paid',
        paidAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(spaCommissionLedger.tenantId, ctx.tenantId),
          inArray(spaCommissionLedger.id, input.ids),
        ),
      );

    const totalPaidCents = entries.reduce(
      (sum, e) => sum + e.commissionAmountCents,
      0,
    );

    return {
      result: {
        paidIds: input.ids,
        paidAt: now.toISOString(),
        count: input.ids.length,
        totalPaidCents,
      },
      events: [],
    };
  });

  await auditLog(ctx, 'spa.commission.paid', 'spa_commission_ledger', input.ids.join(','));

  return result;
}
