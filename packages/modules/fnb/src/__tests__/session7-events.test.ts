import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  CheckPresentedPayload,
  PaymentStartedPayload,
  TenderAppliedPayload,
  PaymentCompletedPayload,
  PaymentFailedPayload,
  CheckCompedPayload,
  CheckDiscountedPayload,
  CheckVoidedPayload,
  CheckRefundedPayload,
} from '../events/types';

describe('Session 7 Events', () => {
  it('has all Session 7 event constants', () => {
    expect(FNB_EVENTS.CHECK_PRESENTED).toBe('fnb.payment.check_presented.v1');
    expect(FNB_EVENTS.PAYMENT_STARTED).toBe('fnb.payment.started.v1');
    expect(FNB_EVENTS.TENDER_APPLIED).toBe('fnb.payment.tender_applied.v1');
    expect(FNB_EVENTS.PAYMENT_COMPLETED).toBe('fnb.payment.completed.v1');
    expect(FNB_EVENTS.PAYMENT_FAILED).toBe('fnb.payment.failed.v1');
    expect(FNB_EVENTS.CHECK_COMPED).toBe('fnb.payment.check_comped.v1');
    expect(FNB_EVENTS.CHECK_DISCOUNTED).toBe('fnb.payment.check_discounted.v1');
    expect(FNB_EVENTS.CHECK_VOIDED).toBe('fnb.payment.check_voided.v1');
    expect(FNB_EVENTS.CHECK_REFUNDED).toBe('fnb.payment.check_refunded.v1');
  });

  it('event constants follow naming convention', () => {
    const s7Events = [
      FNB_EVENTS.CHECK_PRESENTED,
      FNB_EVENTS.PAYMENT_STARTED,
      FNB_EVENTS.TENDER_APPLIED,
      FNB_EVENTS.PAYMENT_COMPLETED,
      FNB_EVENTS.PAYMENT_FAILED,
      FNB_EVENTS.CHECK_COMPED,
      FNB_EVENTS.CHECK_DISCOUNTED,
      FNB_EVENTS.CHECK_VOIDED,
      FNB_EVENTS.CHECK_REFUNDED,
    ];
    for (const evt of s7Events) {
      expect(evt).toMatch(/^fnb\.[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('payload interfaces are structurally valid', () => {
    const checkPresented: CheckPresentedPayload = {
      tabId: 'tab-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      totalCents: 5000,
      seatCount: 4,
      perSeat: false,
      presentedBy: 'user-1',
    };
    expect(checkPresented.totalCents).toBe(5000);

    const paymentStarted: PaymentStartedPayload = {
      paymentSessionId: 'sess-1',
      tabId: 'tab-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      totalAmountCents: 5000,
    };
    expect(paymentStarted.paymentSessionId).toBe('sess-1');

    const tenderApplied: TenderAppliedPayload = {
      paymentSessionId: 'sess-1',
      tenderId: 'tender-1',
      tabId: 'tab-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      amountCents: 3000,
      tenderType: 'card',
    };
    expect(tenderApplied.amountCents).toBe(3000);

    const paymentCompleted: PaymentCompletedPayload = {
      paymentSessionId: 'sess-1',
      tabId: 'tab-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      totalTendersCents: 5100,
      changeCents: 100,
    };
    expect(paymentCompleted.changeCents).toBe(100);

    const paymentFailed: PaymentFailedPayload = {
      paymentSessionId: 'sess-1',
      tabId: 'tab-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      reason: 'Insufficient funds',
    };
    expect(paymentFailed.reason).toBe('Insufficient funds');

    const checkComped: CheckCompedPayload = {
      orderId: 'order-1',
      orderLineId: 'line-1',
      locationId: 'loc-1',
      compAmountCents: 1500,
      reason: 'Manager comp',
      compedBy: 'user-1',
    };
    expect(checkComped.compAmountCents).toBe(1500);

    const checkDiscounted: CheckDiscountedPayload = {
      orderId: 'order-1',
      locationId: 'loc-1',
      discountAmountCents: 500,
      discountType: 'percentage',
      percentage: 10,
    };
    expect(checkDiscounted.percentage).toBe(10);

    const checkVoided: CheckVoidedPayload = {
      orderId: 'order-1',
      tabId: 'tab-1',
      locationId: 'loc-1',
      reason: 'Customer walked out',
      voidedBy: 'user-1',
    };
    expect(checkVoided.reason).toBe('Customer walked out');

    const checkRefunded: CheckRefundedPayload = {
      tenderId: 'rev-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      refundAmountCents: 2000,
      refundMethod: 'original',
      originalTenderId: 'tender-1',
    };
    expect(checkRefunded.refundAmountCents).toBe(2000);
  });
});
