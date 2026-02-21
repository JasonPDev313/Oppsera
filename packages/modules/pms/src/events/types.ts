export const PMS_EVENTS = {
  // Reservation lifecycle
  RESERVATION_CREATED: 'pms.reservation.created.v1',
  RESERVATION_UPDATED: 'pms.reservation.updated.v1',
  RESERVATION_MOVED: 'pms.reservation.moved.v1',
  RESERVATION_CANCELLED: 'pms.reservation.cancelled.v1',
  RESERVATION_CHECKED_IN: 'pms.reservation.checked_in.v1',
  RESERVATION_CHECKED_OUT: 'pms.reservation.checked_out.v1',
  RESERVATION_NO_SHOW: 'pms.reservation.no_show.v1',

  // Room lifecycle
  ROOM_CREATED: 'pms.room.created.v1',
  ROOM_UPDATED: 'pms.room.updated.v1',
  ROOM_STATUS_CHANGED: 'pms.room.status_changed.v1',
  ROOM_OUT_OF_ORDER_SET: 'pms.room.out_of_order_set.v1',
  ROOM_OUT_OF_ORDER_CLEARED: 'pms.room.out_of_order_cleared.v1',

  // Room type lifecycle
  ROOM_TYPE_CREATED: 'pms.room_type.created.v1',
  ROOM_TYPE_UPDATED: 'pms.room_type.updated.v1',

  // Folio lifecycle
  FOLIO_CREATED: 'pms.folio.created.v1',
  FOLIO_CHARGE_POSTED: 'pms.folio.charge_posted.v1',
  FOLIO_CLOSED: 'pms.folio.closed.v1',

  // Property/setup
  PROPERTY_CREATED: 'pms.property.created.v1',
  PROPERTY_UPDATED: 'pms.property.updated.v1',

  // Rate plan lifecycle
  RATE_PLAN_CREATED: 'pms.rate_plan.created.v1',
  RATE_PLAN_UPDATED: 'pms.rate_plan.updated.v1',
  RATE_PLAN_PRICES_SET: 'pms.rate_plan.prices_set.v1',

  // Guest lifecycle
  GUEST_CREATED: 'pms.guest.created.v1',
  GUEST_UPDATED: 'pms.guest.updated.v1',
} as const;

export type PmsEventType = (typeof PMS_EVENTS)[keyof typeof PMS_EVENTS];
