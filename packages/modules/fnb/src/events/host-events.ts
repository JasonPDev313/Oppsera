// ── Host Module V2 Event Constants ────────────────────────────────
export const HOST_EVENTS = {
  RESERVATION_CREATED: 'fnb.reservation.created.v1',
  RESERVATION_UPDATED: 'fnb.reservation.updated.v1',
  RESERVATION_STATUS_CHANGED: 'fnb.reservation.status_changed.v1',
  RESERVATION_CANCELLED: 'fnb.reservation.cancelled.v1',
  WAITLIST_ADDED: 'fnb.waitlist.added.v1',
  WAITLIST_NOTIFIED: 'fnb.waitlist.notified.v1',
  WAITLIST_SEATED: 'fnb.waitlist.seated.v1',
  WAITLIST_REMOVED: 'fnb.waitlist.removed.v1',
  TABLE_TURN_COMPLETED: 'fnb.table.turn_completed.v1',
} as const;

export type HostEventType = (typeof HOST_EVENTS)[keyof typeof HOST_EVENTS];
