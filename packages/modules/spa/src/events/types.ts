/**
 * Spa Module Event Type Constants
 *
 * Naming: {domain}.{entity}.{action}.v{N}
 * All events published via publishWithOutbox through spa_outbox table.
 */
export const SPA_EVENTS = {
  // ── Appointments ──────────────────────────────────────────
  APPOINTMENT_CREATED: 'spa.appointment.created.v1',
  APPOINTMENT_UPDATED: 'spa.appointment.updated.v1',
  APPOINTMENT_CONFIRMED: 'spa.appointment.confirmed.v1',
  APPOINTMENT_CHECKED_IN: 'spa.appointment.checked_in.v1',
  APPOINTMENT_SERVICE_STARTED: 'spa.appointment.service_started.v1',
  APPOINTMENT_COMPLETED: 'spa.appointment.completed.v1',
  APPOINTMENT_CHECKED_OUT: 'spa.appointment.checked_out.v1',
  APPOINTMENT_CANCELED: 'spa.appointment.canceled.v1',
  APPOINTMENT_NO_SHOW: 'spa.appointment.no_show.v1',
  APPOINTMENT_RESCHEDULED: 'spa.appointment.rescheduled.v1',

  // ── Checkout ──────────────────────────────────────────────
  CHECKOUT_READY: 'spa.checkout.ready.v1',
  CHECKOUT_COMPLETED: 'spa.checkout.completed.v1',

  // ── Commissions ───────────────────────────────────────────
  COMMISSION_CALCULATED: 'spa.commission.calculated.v1',
  COMMISSION_APPROVED: 'spa.commission.approved.v1',

  // ── Packages ──────────────────────────────────────────────
  PACKAGE_SOLD: 'spa.package.sold.v1',
  PACKAGE_REDEEMED: 'spa.package.redeemed.v1',
  PACKAGE_EXPIRED: 'spa.package.expired.v1',

  // ── Waitlist ──────────────────────────────────────────────
  WAITLIST_ADDED: 'spa.waitlist.added.v1',
  WAITLIST_OFFERED: 'spa.waitlist.offered.v1',

  // ── Operations ────────────────────────────────────────────
  ROOM_TURNOVER_COMPLETED: 'spa.room.turnover_completed.v1',

  // ── Intake ────────────────────────────────────────────────
  INTAKE_COMPLETED: 'spa.intake.completed.v1',
  CONSENT_SIGNED: 'spa.consent.signed.v1',

  // ── Services ──────────────────────────────────────────────
  SERVICE_CREATED: 'spa.service.created.v1',
  SERVICE_UPDATED: 'spa.service.updated.v1',
  SERVICE_ARCHIVED: 'spa.service.archived.v1',

  // ── Providers ─────────────────────────────────────────────
  PROVIDER_CREATED: 'spa.provider.created.v1',
  PROVIDER_UPDATED: 'spa.provider.updated.v1',
  PROVIDER_DEACTIVATED: 'spa.provider.deactivated.v1',

  // ── Resources ─────────────────────────────────────────────
  RESOURCE_CREATED: 'spa.resource.created.v1',
  RESOURCE_UPDATED: 'spa.resource.updated.v1',
} as const;

export type SpaEventType = (typeof SPA_EVENTS)[keyof typeof SPA_EVENTS];
