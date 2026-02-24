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

  // Rate restriction lifecycle
  RATE_RESTRICTION_SET: 'pms.rate_restriction.set.v1',
  RATE_RESTRICTION_CLEARED: 'pms.rate_restriction.cleared.v1',

  // Payment lifecycle
  PAYMENT_METHOD_SAVED: 'pms.payment_method.saved.v1',
  PAYMENT_AUTHORIZED: 'pms.payment.authorized.v1',
  PAYMENT_CAPTURED: 'pms.payment.captured.v1',
  PAYMENT_CHARGED: 'pms.payment.charged.v1',
  PAYMENT_REFUNDED: 'pms.payment.refunded.v1',
  PAYMENT_FAILED: 'pms.payment.failed.v1',

  // Communication lifecycle
  MESSAGE_SENT: 'pms.message.sent.v1',
  MESSAGE_FAILED: 'pms.message.failed.v1',
  COMMUNICATION_LOGGED: 'pms.communication.logged.v1',

  // Housekeeping
  HOUSEKEEPING_ASSIGNED: 'pms.housekeeping.assigned.v1',
  HOUSEKEEPING_STARTED: 'pms.housekeeping.started.v1',
  HOUSEKEEPING_COMPLETED: 'pms.housekeeping.completed.v1',
  HOUSEKEEPING_SKIPPED: 'pms.housekeeping.skipped.v1',

  // Maintenance
  WORK_ORDER_CREATED: 'pms.work_order.created.v1',
  WORK_ORDER_COMPLETED: 'pms.work_order.completed.v1',

  // Rate packages
  RATE_PACKAGE_CREATED: 'pms.rate_package.created.v1',
  RATE_PACKAGE_UPDATED: 'pms.rate_package.updated.v1',
  RATE_PACKAGE_DEACTIVATED: 'pms.rate_package.deactivated.v1',

  // Group bookings
  GROUP_CREATED: 'pms.group.created.v1',
  GROUP_UPDATED: 'pms.group.updated.v1',
  GROUP_BLOCKS_SET: 'pms.group.blocks_set.v1',
  GROUP_ROOM_PICKED_UP: 'pms.group.room_picked_up.v1',
  GROUP_BLOCKS_RELEASED: 'pms.group.blocks_released.v1',

  // Corporate accounts
  CORPORATE_ACCOUNT_CREATED: 'pms.corporate_account.created.v1',
  CORPORATE_ACCOUNT_UPDATED: 'pms.corporate_account.updated.v1',
  CORPORATE_ACCOUNT_DEACTIVATED: 'pms.corporate_account.deactivated.v1',
  CORPORATE_RATES_SET: 'pms.corporate_account.rates_set.v1',

  // Pricing rules
  PRICING_RULE_CREATED: 'pms.pricing_rule.created.v1',
  PRICING_RULE_UPDATED: 'pms.pricing_rule.updated.v1',
  PRICING_RULE_DEACTIVATED: 'pms.pricing_rule.deactivated.v1',
  PRICING_ENGINE_RUN: 'pms.pricing_engine.run.v1',

  // Channel Manager
  CHANNEL_CREATED: 'pms.channel.created.v1',
  CHANNEL_UPDATED: 'pms.channel.updated.v1',
  CHANNEL_SYNC_STARTED: 'pms.channel.sync_started.v1',
  CHANNEL_SYNC_COMPLETED: 'pms.channel.sync_completed.v1',

  // Booking Engine
  BOOKING_ENGINE_CONFIG_UPDATED: 'pms.booking_engine.config_updated.v1',

  // Auto Room Assignment
  AUTO_ASSIGNMENT_RUN: 'pms.auto_assignment.run.v1',

  // Guest Self-Service Portal
  GUEST_PORTAL_SESSION_CREATED: 'pms.guest_portal.session_created.v1',
  PRE_CHECKIN_COMPLETED: 'pms.guest_portal.pre_checkin_completed.v1',

  // Loyalty
  LOYALTY_PROGRAM_CREATED: 'pms.loyalty_program.created.v1',
  LOYALTY_PROGRAM_UPDATED: 'pms.loyalty_program.updated.v1',
  LOYALTY_MEMBER_ENROLLED: 'pms.loyalty_member.enrolled.v1',
  LOYALTY_POINTS_EARNED: 'pms.loyalty.points_earned.v1',
  LOYALTY_POINTS_REDEEMED: 'pms.loyalty.points_redeemed.v1',
  LOYALTY_POINTS_ADJUSTED: 'pms.loyalty.points_adjusted.v1',
} as const;

export type PmsEventType = (typeof PMS_EVENTS)[keyof typeof PMS_EVENTS];
