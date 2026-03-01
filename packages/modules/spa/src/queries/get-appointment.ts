import { eq, and } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
  spaProviders,
  spaResources,
  spaIntakeResponses,
  spaClinicalNotes,
  spaAppointmentHistory,
} from '@oppsera/db';

export interface AppointmentItemDetail {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  serviceDurationMinutes: number;
  addonId: string | null;
  providerId: string | null;
  providerName: string | null;
  providerColor: string | null;
  resourceId: string | null;
  resourceName: string | null;
  startAt: Date;
  endAt: Date;
  priceCents: number;
  memberPriceCents: number | null;
  finalPriceCents: number;
  discountAmountCents: number;
  discountReason: string | null;
  packageBalanceId: string | null;
  notes: string | null;
  status: string;
  sortOrder: number;
}

export interface AppointmentIntakeResponse {
  id: string;
  templateId: string;
  responses: Record<string, unknown>;
  signedAt: Date | null;
  createdAt: Date;
}

export interface AppointmentClinicalNote {
  id: string;
  providerId: string;
  noteType: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  generalNotes: string | null;
  isConfidential: boolean;
  createdAt: Date;
}

export interface AppointmentHistoryEntry {
  id: string;
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  changes: Record<string, unknown> | null;
  performedBy: string | null;
  performedAt: Date;
  reason: string | null;
}

export interface AppointmentDetail {
  id: string;
  appointmentNumber: string;
  customerId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  locationId: string | null;
  providerId: string | null;
  providerName: string | null;
  providerColor: string | null;
  providerPhotoUrl: string | null;
  resourceId: string | null;
  resourceName: string | null;
  resourceType: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  bookingSource: string;
  bookingChannel: string | null;
  notes: string | null;
  internalNotes: string | null;
  depositAmountCents: number;
  depositStatus: string;
  depositPaymentId: string | null;
  cancellationReason: string | null;
  canceledAt: Date | null;
  canceledBy: string | null;
  noShowFeeCharged: boolean;
  checkedInAt: Date | null;
  checkedInBy: string | null;
  serviceStartedAt: Date | null;
  serviceCompletedAt: Date | null;
  checkedOutAt: Date | null;
  orderId: string | null;
  pmsFolioId: string | null;
  recurrenceRule: Record<string, unknown> | null;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: AppointmentItemDetail[];
  intakeResponses: AppointmentIntakeResponse[];
  clinicalNotes: AppointmentClinicalNote[];
  history: AppointmentHistoryEntry[];
}

/**
 * Get a single appointment with full details.
 * Includes: services with individual status/timing, provider/resource info,
 * intake form responses, clinical notes, and status history.
 * Returns null if not found.
 */
export async function getAppointment(input: {
  tenantId: string;
  appointmentId: string;
}): Promise<AppointmentDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch the appointment with provider + resource
    const [appointment] = await tx
      .select({
        id: spaAppointments.id,
        appointmentNumber: spaAppointments.appointmentNumber,
        customerId: spaAppointments.customerId,
        guestName: spaAppointments.guestName,
        guestEmail: spaAppointments.guestEmail,
        guestPhone: spaAppointments.guestPhone,
        locationId: spaAppointments.locationId,
        providerId: spaAppointments.providerId,
        providerName: spaProviders.displayName,
        providerColor: spaProviders.color,
        providerPhotoUrl: spaProviders.photoUrl,
        resourceId: spaAppointments.resourceId,
        resourceName: spaResources.name,
        resourceType: spaResources.resourceType,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
        bookingSource: spaAppointments.bookingSource,
        bookingChannel: spaAppointments.bookingChannel,
        notes: spaAppointments.notes,
        internalNotes: spaAppointments.internalNotes,
        depositAmountCents: spaAppointments.depositAmountCents,
        depositStatus: spaAppointments.depositStatus,
        depositPaymentId: spaAppointments.depositPaymentId,
        cancellationReason: spaAppointments.cancellationReason,
        canceledAt: spaAppointments.canceledAt,
        canceledBy: spaAppointments.canceledBy,
        noShowFeeCharged: spaAppointments.noShowFeeCharged,
        checkedInAt: spaAppointments.checkedInAt,
        checkedInBy: spaAppointments.checkedInBy,
        serviceStartedAt: spaAppointments.serviceStartedAt,
        serviceCompletedAt: spaAppointments.serviceCompletedAt,
        checkedOutAt: spaAppointments.checkedOutAt,
        orderId: spaAppointments.orderId,
        pmsFolioId: spaAppointments.pmsFolioId,
        recurrenceRule: spaAppointments.recurrenceRule,
        version: spaAppointments.version,
        createdBy: spaAppointments.createdBy,
        updatedBy: spaAppointments.updatedBy,
        createdAt: spaAppointments.createdAt,
        updatedAt: spaAppointments.updatedAt,
      })
      .from(spaAppointments)
      .leftJoin(spaProviders, eq(spaAppointments.providerId, spaProviders.id))
      .leftJoin(spaResources, eq(spaAppointments.resourceId, spaResources.id))
      .where(
        and(
          eq(spaAppointments.id, input.appointmentId),
          eq(spaAppointments.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!appointment) {
      return null;
    }

    // Fetch items, intake responses, clinical notes, and history in parallel
    const [itemRows, intakeRows, noteRows, historyRows] = await Promise.all([
      tx
        .select({
          id: spaAppointmentItems.id,
          serviceId: spaAppointmentItems.serviceId,
          serviceName: spaServices.name,
          serviceCategory: spaServices.category,
          serviceDurationMinutes: spaServices.durationMinutes,
          addonId: spaAppointmentItems.addonId,
          providerId: spaAppointmentItems.providerId,
          providerName: spaProviders.displayName,
          providerColor: spaProviders.color,
          resourceId: spaAppointmentItems.resourceId,
          resourceName: spaResources.name,
          startAt: spaAppointmentItems.startAt,
          endAt: spaAppointmentItems.endAt,
          priceCents: spaAppointmentItems.priceCents,
          memberPriceCents: spaAppointmentItems.memberPriceCents,
          finalPriceCents: spaAppointmentItems.finalPriceCents,
          discountAmountCents: spaAppointmentItems.discountAmountCents,
          discountReason: spaAppointmentItems.discountReason,
          packageBalanceId: spaAppointmentItems.packageBalanceId,
          notes: spaAppointmentItems.notes,
          status: spaAppointmentItems.status,
          sortOrder: spaAppointmentItems.sortOrder,
        })
        .from(spaAppointmentItems)
        .innerJoin(spaServices, eq(spaAppointmentItems.serviceId, spaServices.id))
        .leftJoin(spaProviders, eq(spaAppointmentItems.providerId, spaProviders.id))
        .leftJoin(spaResources, eq(spaAppointmentItems.resourceId, spaResources.id))
        .where(
          and(
            eq(spaAppointmentItems.appointmentId, input.appointmentId),
            eq(spaAppointmentItems.tenantId, input.tenantId),
          ),
        )
        .orderBy(spaAppointmentItems.sortOrder),

      tx
        .select({
          id: spaIntakeResponses.id,
          templateId: spaIntakeResponses.templateId,
          responses: spaIntakeResponses.responses,
          signedAt: spaIntakeResponses.signedAt,
          createdAt: spaIntakeResponses.createdAt,
        })
        .from(spaIntakeResponses)
        .where(
          and(
            eq(spaIntakeResponses.appointmentId, input.appointmentId),
            eq(spaIntakeResponses.tenantId, input.tenantId),
          ),
        ),

      tx
        .select({
          id: spaClinicalNotes.id,
          providerId: spaClinicalNotes.providerId,
          noteType: spaClinicalNotes.noteType,
          subjective: spaClinicalNotes.subjective,
          objective: spaClinicalNotes.objective,
          assessment: spaClinicalNotes.assessment,
          plan: spaClinicalNotes.plan,
          generalNotes: spaClinicalNotes.generalNotes,
          isConfidential: spaClinicalNotes.isConfidential,
          createdAt: spaClinicalNotes.createdAt,
        })
        .from(spaClinicalNotes)
        .where(
          and(
            eq(spaClinicalNotes.appointmentId, input.appointmentId),
            eq(spaClinicalNotes.tenantId, input.tenantId),
          ),
        ),

      tx
        .select({
          id: spaAppointmentHistory.id,
          action: spaAppointmentHistory.action,
          oldStatus: spaAppointmentHistory.oldStatus,
          newStatus: spaAppointmentHistory.newStatus,
          changes: spaAppointmentHistory.changes,
          performedBy: spaAppointmentHistory.performedBy,
          performedAt: spaAppointmentHistory.performedAt,
          reason: spaAppointmentHistory.reason,
        })
        .from(spaAppointmentHistory)
        .where(
          and(
            eq(spaAppointmentHistory.appointmentId, input.appointmentId),
            eq(spaAppointmentHistory.tenantId, input.tenantId),
          ),
        ),
    ]);

    const items: AppointmentItemDetail[] = itemRows.map((r) => ({
      id: r.id,
      serviceId: r.serviceId,
      serviceName: r.serviceName,
      serviceCategory: r.serviceCategory,
      serviceDurationMinutes: r.serviceDurationMinutes,
      addonId: r.addonId ?? null,
      providerId: r.providerId ?? null,
      providerName: r.providerName ?? null,
      providerColor: r.providerColor ?? null,
      resourceId: r.resourceId ?? null,
      resourceName: r.resourceName ?? null,
      startAt: r.startAt,
      endAt: r.endAt,
      priceCents: r.priceCents,
      memberPriceCents: r.memberPriceCents ?? null,
      finalPriceCents: r.finalPriceCents,
      discountAmountCents: r.discountAmountCents,
      discountReason: r.discountReason ?? null,
      packageBalanceId: r.packageBalanceId ?? null,
      notes: r.notes ?? null,
      status: r.status,
      sortOrder: r.sortOrder,
    }));

    const intakeResponses: AppointmentIntakeResponse[] = intakeRows.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      responses: r.responses as Record<string, unknown>,
      signedAt: r.signedAt ?? null,
      createdAt: r.createdAt,
    }));

    const clinicalNotes: AppointmentClinicalNote[] = noteRows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      noteType: r.noteType,
      subjective: r.subjective ?? null,
      objective: r.objective ?? null,
      assessment: r.assessment ?? null,
      plan: r.plan ?? null,
      generalNotes: r.generalNotes ?? null,
      isConfidential: r.isConfidential,
      createdAt: r.createdAt,
    }));

    const history: AppointmentHistoryEntry[] = historyRows.map((r) => ({
      id: r.id,
      action: r.action,
      oldStatus: r.oldStatus ?? null,
      newStatus: r.newStatus ?? null,
      changes: (r.changes as Record<string, unknown>) ?? null,
      performedBy: r.performedBy ?? null,
      performedAt: r.performedAt,
      reason: r.reason ?? null,
    }));

    return {
      id: appointment.id,
      appointmentNumber: appointment.appointmentNumber,
      customerId: appointment.customerId ?? null,
      guestName: appointment.guestName ?? null,
      guestEmail: appointment.guestEmail ?? null,
      guestPhone: appointment.guestPhone ?? null,
      locationId: appointment.locationId ?? null,
      providerId: appointment.providerId ?? null,
      providerName: appointment.providerName ?? null,
      providerColor: appointment.providerColor ?? null,
      providerPhotoUrl: appointment.providerPhotoUrl ?? null,
      resourceId: appointment.resourceId ?? null,
      resourceName: appointment.resourceName ?? null,
      resourceType: appointment.resourceType ?? null,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      bookingSource: appointment.bookingSource,
      bookingChannel: appointment.bookingChannel ?? null,
      notes: appointment.notes ?? null,
      internalNotes: appointment.internalNotes ?? null,
      depositAmountCents: appointment.depositAmountCents,
      depositStatus: appointment.depositStatus,
      depositPaymentId: appointment.depositPaymentId ?? null,
      cancellationReason: appointment.cancellationReason ?? null,
      canceledAt: appointment.canceledAt ?? null,
      canceledBy: appointment.canceledBy ?? null,
      noShowFeeCharged: appointment.noShowFeeCharged,
      checkedInAt: appointment.checkedInAt ?? null,
      checkedInBy: appointment.checkedInBy ?? null,
      serviceStartedAt: appointment.serviceStartedAt ?? null,
      serviceCompletedAt: appointment.serviceCompletedAt ?? null,
      checkedOutAt: appointment.checkedOutAt ?? null,
      orderId: appointment.orderId ?? null,
      pmsFolioId: appointment.pmsFolioId ?? null,
      recurrenceRule: (appointment.recurrenceRule as Record<string, unknown>) ?? null,
      version: appointment.version,
      createdBy: appointment.createdBy ?? null,
      updatedBy: appointment.updatedBy ?? null,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      items,
      intakeResponses,
      clinicalNotes,
      history,
    };
  });
}
