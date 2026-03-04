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
  PARTY_SEATED: 'fnb.party.seated.v1',
  PACING_RULE_UPDATED: 'fnb.pacing.rule_updated.v1',
  PACING_RULE_DELETED: 'fnb.pacing.rule_deleted.v1',
  // Session 4 — POS Integration: Event-Driven Status Progression
  TABLE_AUTO_PROGRESSED: 'fnb.table.auto_progressed.v1',
  TABLE_MARKED_CLEAN: 'fnb.table.marked_clean.v1',
  // Session 5 — Waitlist Auto-Promotion
  WAITLIST_TABLE_OFFERED: 'fnb.waitlist.table_offered.v1',
  WAITLIST_OFFER_ACCEPTED: 'fnb.waitlist.offer_accepted.v1',
  WAITLIST_OFFER_DECLINED: 'fnb.waitlist.offer_declined.v1',
  WAITLIST_OFFER_EXPIRED: 'fnb.waitlist.offer_expired.v1',
  // Session 8 — Waitlist V1 Config
  WAITLIST_SETTINGS_UPDATED: 'fnb.waitlist.settings_updated.v1',
} as const;

export type HostEventType = (typeof HOST_EVENTS)[keyof typeof HOST_EVENTS];
