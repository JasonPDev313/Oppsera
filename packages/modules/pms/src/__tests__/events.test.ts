import { describe, it, expect } from 'vitest';
import { PMS_EVENTS } from '../events/types';
import type {
  ReservationCreatedPayload,
  ReservationUpdatedPayload,
  ReservationMovedPayload,
  ReservationCancelledPayload,
  ReservationCheckedInPayload,
  ReservationCheckedOutPayload,
  ReservationNoShowPayload,
  RoomStatusChangedPayload,
  FolioChargePostedPayload,
  FolioClosedPayload,
} from '../events/payloads';

describe('PMS_EVENTS', () => {
  it('has all reservation lifecycle events', () => {
    expect(PMS_EVENTS.RESERVATION_CREATED).toBe('pms.reservation.created.v1');
    expect(PMS_EVENTS.RESERVATION_UPDATED).toBe('pms.reservation.updated.v1');
    expect(PMS_EVENTS.RESERVATION_MOVED).toBe('pms.reservation.moved.v1');
    expect(PMS_EVENTS.RESERVATION_CANCELLED).toBe('pms.reservation.cancelled.v1');
    expect(PMS_EVENTS.RESERVATION_CHECKED_IN).toBe('pms.reservation.checked_in.v1');
    expect(PMS_EVENTS.RESERVATION_CHECKED_OUT).toBe('pms.reservation.checked_out.v1');
    expect(PMS_EVENTS.RESERVATION_NO_SHOW).toBe('pms.reservation.no_show.v1');
  });

  it('has all room lifecycle events', () => {
    expect(PMS_EVENTS.ROOM_CREATED).toBe('pms.room.created.v1');
    expect(PMS_EVENTS.ROOM_UPDATED).toBe('pms.room.updated.v1');
    expect(PMS_EVENTS.ROOM_STATUS_CHANGED).toBe('pms.room.status_changed.v1');
    expect(PMS_EVENTS.ROOM_OUT_OF_ORDER_SET).toBe('pms.room.out_of_order_set.v1');
    expect(PMS_EVENTS.ROOM_OUT_OF_ORDER_CLEARED).toBe('pms.room.out_of_order_cleared.v1');
  });

  it('has all folio lifecycle events', () => {
    expect(PMS_EVENTS.FOLIO_CREATED).toBe('pms.folio.created.v1');
    expect(PMS_EVENTS.FOLIO_CHARGE_POSTED).toBe('pms.folio.charge_posted.v1');
    expect(PMS_EVENTS.FOLIO_CLOSED).toBe('pms.folio.closed.v1');
  });

  it('has property events', () => {
    expect(PMS_EVENTS.PROPERTY_CREATED).toBe('pms.property.created.v1');
    expect(PMS_EVENTS.PROPERTY_UPDATED).toBe('pms.property.updated.v1');
  });

  it('has rate plan events', () => {
    expect(PMS_EVENTS.RATE_PLAN_CREATED).toBe('pms.rate_plan.created.v1');
    expect(PMS_EVENTS.RATE_PLAN_UPDATED).toBe('pms.rate_plan.updated.v1');
    expect(PMS_EVENTS.RATE_PLAN_PRICES_SET).toBe('pms.rate_plan.prices_set.v1');
  });

  it('has guest events', () => {
    expect(PMS_EVENTS.GUEST_CREATED).toBe('pms.guest.created.v1');
    expect(PMS_EVENTS.GUEST_UPDATED).toBe('pms.guest.updated.v1');
  });

  it('has rate restriction events', () => {
    expect(PMS_EVENTS.RATE_RESTRICTION_SET).toBe('pms.rate_restriction.set.v1');
    expect(PMS_EVENTS.RATE_RESTRICTION_CLEARED).toBe('pms.rate_restriction.cleared.v1');
  });

  it('has payment events', () => {
    expect(PMS_EVENTS.PAYMENT_METHOD_SAVED).toBe('pms.payment_method.saved.v1');
    expect(PMS_EVENTS.PAYMENT_AUTHORIZED).toBe('pms.payment.authorized.v1');
    expect(PMS_EVENTS.PAYMENT_CAPTURED).toBe('pms.payment.captured.v1');
    expect(PMS_EVENTS.PAYMENT_CHARGED).toBe('pms.payment.charged.v1');
    expect(PMS_EVENTS.PAYMENT_REFUNDED).toBe('pms.payment.refunded.v1');
    expect(PMS_EVENTS.PAYMENT_FAILED).toBe('pms.payment.failed.v1');
  });

  it('has communication events', () => {
    expect(PMS_EVENTS.MESSAGE_SENT).toBe('pms.message.sent.v1');
    expect(PMS_EVENTS.MESSAGE_FAILED).toBe('pms.message.failed.v1');
    expect(PMS_EVENTS.COMMUNICATION_LOGGED).toBe('pms.communication.logged.v1');
  });

  it('has housekeeping events', () => {
    expect(PMS_EVENTS.HOUSEKEEPING_ASSIGNED).toBe('pms.housekeeping.assigned.v1');
    expect(PMS_EVENTS.HOUSEKEEPING_STARTED).toBe('pms.housekeeping.started.v1');
    expect(PMS_EVENTS.HOUSEKEEPING_COMPLETED).toBe('pms.housekeeping.completed.v1');
    expect(PMS_EVENTS.HOUSEKEEPING_SKIPPED).toBe('pms.housekeeping.skipped.v1');
  });

  it('has maintenance events', () => {
    expect(PMS_EVENTS.WORK_ORDER_CREATED).toBe('pms.work_order.created.v1');
    expect(PMS_EVENTS.WORK_ORDER_COMPLETED).toBe('pms.work_order.completed.v1');
  });

  it('has rate package events', () => {
    expect(PMS_EVENTS.RATE_PACKAGE_CREATED).toBe('pms.rate_package.created.v1');
    expect(PMS_EVENTS.RATE_PACKAGE_UPDATED).toBe('pms.rate_package.updated.v1');
    expect(PMS_EVENTS.RATE_PACKAGE_DEACTIVATED).toBe('pms.rate_package.deactivated.v1');
  });

  it('has group booking events', () => {
    expect(PMS_EVENTS.GROUP_CREATED).toBe('pms.group.created.v1');
    expect(PMS_EVENTS.GROUP_UPDATED).toBe('pms.group.updated.v1');
    expect(PMS_EVENTS.GROUP_BLOCKS_SET).toBe('pms.group.blocks_set.v1');
    expect(PMS_EVENTS.GROUP_ROOM_PICKED_UP).toBe('pms.group.room_picked_up.v1');
    expect(PMS_EVENTS.GROUP_BLOCKS_RELEASED).toBe('pms.group.blocks_released.v1');
  });

  it('has corporate account events', () => {
    expect(PMS_EVENTS.CORPORATE_ACCOUNT_CREATED).toBe('pms.corporate_account.created.v1');
    expect(PMS_EVENTS.CORPORATE_ACCOUNT_UPDATED).toBe('pms.corporate_account.updated.v1');
    expect(PMS_EVENTS.CORPORATE_ACCOUNT_DEACTIVATED).toBe('pms.corporate_account.deactivated.v1');
    expect(PMS_EVENTS.CORPORATE_RATES_SET).toBe('pms.corporate_account.rates_set.v1');
  });

  it('has pricing rule events', () => {
    expect(PMS_EVENTS.PRICING_RULE_CREATED).toBe('pms.pricing_rule.created.v1');
    expect(PMS_EVENTS.PRICING_RULE_UPDATED).toBe('pms.pricing_rule.updated.v1');
    expect(PMS_EVENTS.PRICING_RULE_DEACTIVATED).toBe('pms.pricing_rule.deactivated.v1');
    expect(PMS_EVENTS.PRICING_ENGINE_RUN).toBe('pms.pricing_engine.run.v1');
  });

  it('has channel manager events', () => {
    expect(PMS_EVENTS.CHANNEL_CREATED).toBe('pms.channel.created.v1');
    expect(PMS_EVENTS.CHANNEL_UPDATED).toBe('pms.channel.updated.v1');
    expect(PMS_EVENTS.CHANNEL_SYNC_STARTED).toBe('pms.channel.sync_started.v1');
    expect(PMS_EVENTS.CHANNEL_SYNC_COMPLETED).toBe('pms.channel.sync_completed.v1');
  });

  it('has booking engine events', () => {
    expect(PMS_EVENTS.BOOKING_ENGINE_CONFIG_UPDATED).toBe('pms.booking_engine.config_updated.v1');
  });

  it('has auto assignment events', () => {
    expect(PMS_EVENTS.AUTO_ASSIGNMENT_RUN).toBe('pms.auto_assignment.run.v1');
  });

  it('has guest portal events', () => {
    expect(PMS_EVENTS.GUEST_PORTAL_SESSION_CREATED).toBe('pms.guest_portal.session_created.v1');
    expect(PMS_EVENTS.PRE_CHECKIN_COMPLETED).toBe('pms.guest_portal.pre_checkin_completed.v1');
  });

  it('has loyalty events', () => {
    expect(PMS_EVENTS.LOYALTY_PROGRAM_CREATED).toBe('pms.loyalty_program.created.v1');
    expect(PMS_EVENTS.LOYALTY_PROGRAM_UPDATED).toBe('pms.loyalty_program.updated.v1');
    expect(PMS_EVENTS.LOYALTY_MEMBER_ENROLLED).toBe('pms.loyalty_member.enrolled.v1');
    expect(PMS_EVENTS.LOYALTY_POINTS_EARNED).toBe('pms.loyalty.points_earned.v1');
    expect(PMS_EVENTS.LOYALTY_POINTS_REDEEMED).toBe('pms.loyalty.points_redeemed.v1');
    expect(PMS_EVENTS.LOYALTY_POINTS_ADJUSTED).toBe('pms.loyalty.points_adjusted.v1');
  });

  it('all event types follow pms.* naming convention', () => {
    for (const eventType of Object.values(PMS_EVENTS)) {
      expect(eventType).toMatch(/^pms\./);
      expect(eventType).toMatch(/\.v\d+$/);
    }
  });

  it('all event types are unique', () => {
    const values = Object.values(PMS_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has no duplicate event keys', () => {
    const keys = Object.keys(PMS_EVENTS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has at least 50 event types', () => {
    const count = Object.keys(PMS_EVENTS).length;
    expect(count).toBeGreaterThanOrEqual(50);
  });
});

describe('Event payload type contracts', () => {
  it('ReservationCreatedPayload has required fields', () => {
    const payload: ReservationCreatedPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      guestId: 'guest-1',
      guestName: 'John Doe',
      roomId: 'room-1',
      roomTypeId: 'rt-1',
      checkInDate: '2026-04-01',
      checkOutDate: '2026-04-05',
      status: 'CONFIRMED',
      sourceType: 'DIRECT',
      nightlyRateCents: 15000,
      totalCents: 60000,
      version: 1,
    };

    expect(payload.reservationId).toBeDefined();
    expect(payload.propertyId).toBeDefined();
    expect(payload.version).toBe(1);
    expect(payload.totalCents).toBe(60000);
  });

  it('ReservationCreatedPayload allows null guestId and roomId', () => {
    const payload: ReservationCreatedPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      guestId: null,
      guestName: 'Walk-in',
      roomId: null,
      roomTypeId: 'rt-1',
      checkInDate: '2026-04-01',
      checkOutDate: '2026-04-05',
      status: 'HOLD',
      sourceType: 'PHONE',
      nightlyRateCents: 15000,
      totalCents: 60000,
      version: 1,
    };

    expect(payload.guestId).toBeNull();
    expect(payload.roomId).toBeNull();
  });

  it('ReservationMovedPayload has before and after', () => {
    const payload: ReservationMovedPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      before: {
        roomId: 'room-1',
        checkInDate: '2026-04-01',
        checkOutDate: '2026-04-05',
      },
      after: {
        roomId: 'room-2',
        checkInDate: '2026-04-02',
        checkOutDate: '2026-04-06',
      },
      guestName: 'John Doe',
      status: 'CONFIRMED',
      version: 2,
      resized: true,
    };

    expect(payload.before.roomId).toBe('room-1');
    expect(payload.after.roomId).toBe('room-2');
    expect(payload.resized).toBe(true);
  });

  it('ReservationCancelledPayload has previousStatus', () => {
    const payload: ReservationCancelledPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      guestName: 'John Doe',
      roomId: 'room-1',
      checkInDate: '2026-04-01',
      checkOutDate: '2026-04-05',
      previousStatus: 'CONFIRMED',
      version: 2,
    };

    expect(payload.previousStatus).toBe('CONFIRMED');
  });

  it('ReservationCheckedInPayload has earlyCheckIn flag', () => {
    const payload: ReservationCheckedInPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      guestName: 'John Doe',
      roomId: 'room-1',
      checkInDate: '2026-04-01',
      checkOutDate: '2026-04-05',
      earlyCheckIn: true,
      version: 2,
    };

    expect(payload.earlyCheckIn).toBe(true);
    // roomId is NOT nullable on check-in (room must be assigned)
    expect(payload.roomId).toBe('room-1');
  });

  it('ReservationCheckedOutPayload has lateCheckOut flag', () => {
    const payload: ReservationCheckedOutPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      guestName: 'John Doe',
      roomId: 'room-1',
      checkInDate: '2026-04-01',
      checkOutDate: '2026-04-05',
      lateCheckOut: false,
      version: 3,
    };

    expect(payload.lateCheckOut).toBe(false);
  });

  it('RoomStatusChangedPayload has from/to status', () => {
    const payload: RoomStatusChangedPayload = {
      roomId: 'room-1',
      propertyId: 'prop-1',
      fromStatus: 'VACANT_CLEAN',
      toStatus: 'OCCUPIED',
      reason: null,
      businessDate: '2026-04-01',
    };

    expect(payload.fromStatus).toBe('VACANT_CLEAN');
    expect(payload.toStatus).toBe('OCCUPIED');
    expect(payload.reason).toBeNull();
  });

  it('FolioChargePostedPayload has entry details', () => {
    const payload: FolioChargePostedPayload = {
      folioId: 'folio-1',
      reservationId: 'res-1',
      entryId: 'entry-1',
      entryType: 'ROOM_CHARGE',
      amountCents: 15000,
    };

    expect(payload.entryType).toBe('ROOM_CHARGE');
    expect(payload.amountCents).toBe(15000);
  });

  it('FolioClosedPayload has totalCents', () => {
    const payload: FolioClosedPayload = {
      folioId: 'folio-1',
      reservationId: 'res-1',
      totalCents: 60000,
    };

    expect(payload.totalCents).toBe(60000);
  });

  it('ReservationUpdatedPayload has changes array', () => {
    const payload: ReservationUpdatedPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      version: 2,
      changes: ['guestName', 'specialRequests'],
    };

    expect(payload.changes).toContain('guestName');
    expect(payload.changes).toContain('specialRequests');
  });

  it('ReservationNoShowPayload has all required fields', () => {
    const payload: ReservationNoShowPayload = {
      reservationId: 'res-1',
      propertyId: 'prop-1',
      guestName: 'No-show Guest',
      roomId: 'room-1',
      checkInDate: '2026-04-01',
      checkOutDate: '2026-04-05',
      version: 2,
    };

    expect(payload.reservationId).toBe('res-1');
    expect(payload.guestName).toBe('No-show Guest');
  });
});
