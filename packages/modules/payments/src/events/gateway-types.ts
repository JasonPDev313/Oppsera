// Payment gateway event type constants
export const PAYMENT_GATEWAY_EVENTS = {
  AUTHORIZED: 'payment.gateway.authorized.v1',
  CAPTURED: 'payment.gateway.captured.v1',
  VOIDED: 'payment.gateway.voided.v1',
  REFUNDED: 'payment.gateway.refunded.v1',
  DECLINED: 'payment.gateway.declined.v1',
  SETTLED: 'payment.gateway.settled.v1',
  CHARGEBACK_RECEIVED: 'payment.gateway.chargeback_received.v1',
  CARD_UPDATED: 'payment.gateway.card_updated.v1',
  PROFILE_CREATED: 'payment.gateway.profile_created.v1',
  PROFILE_DELETED: 'payment.gateway.profile_deleted.v1',
} as const;

export type PaymentGatewayEventType =
  (typeof PAYMENT_GATEWAY_EVENTS)[keyof typeof PAYMENT_GATEWAY_EVENTS];

// ── Event Payloads ───────────────────────────────────────────────

export interface PaymentAuthorizedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  authorizedAmountCents: number;
  currency: string;
  cardLast4: string | null;
  cardBrand: string | null;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
  paymentMethodType: string;
}

export interface PaymentCapturedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  capturedAmountCents: number;
  currency: string;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
  tenderId: string | null;
}

export interface PaymentVoidedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  amountCents: number;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
}

export interface PaymentRefundedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  amountCents: number;
  refundedAmountCents: number;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
}

export interface PaymentDeclinedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  amountCents: number;
  orderId: string | null;
  customerId: string | null;
  responseCode: string | null;
  responseText: string | null;
  paymentMethodType: string;
}

export interface PaymentSettledPayload {
  tenantId: string;
  locationId: string;
  settlementId: string;
  settlementDate: string;
  totalAmountCents: number;
  transactionCount: number;
  merchantAccountId: string;
}

export interface PaymentChargebackReceivedPayload {
  tenantId: string;
  locationId: string;
  chargebackId: string;
  paymentIntentId: string;
  amountCents: number;
  reason: string;
  providerCaseId: string | null;
}

export interface CardUpdatedPayload {
  tenantId: string;
  customerId: string;
  paymentMethodId: string;
  cardLast4: string;
  cardBrand: string;
  newExpiry: string;
}

export interface ProfileCreatedPayload {
  tenantId: string;
  customerId: string;
  paymentMethodId: string;
  providerProfileId: string;
  cardLast4: string;
  cardBrand: string;
}

export interface ProfileDeletedPayload {
  tenantId: string;
  customerId: string;
  paymentMethodId: string;
  providerProfileId: string;
}

// ── Payment Intent Status ────────────────────────────────────────

export type PaymentIntentStatus =
  | 'created'
  | 'authorized'
  | 'capture_pending'
  | 'captured'
  | 'voided'
  | 'refund_pending'
  | 'refunded'
  | 'declined'
  | 'error'
  | 'resolved';

export const VALID_INTENT_STATUSES: PaymentIntentStatus[] = [
  'created',
  'authorized',
  'capture_pending',
  'captured',
  'voided',
  'refund_pending',
  'refunded',
  'declined',
  'error',
  'resolved',
];

// Status transitions allowed
export const INTENT_STATUS_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  created: ['authorized', 'captured', 'declined', 'error'],
  authorized: ['capture_pending', 'captured', 'voided', 'error'],
  capture_pending: ['captured', 'error'],
  captured: ['voided', 'refund_pending', 'refunded'],
  voided: [], // terminal
  refund_pending: ['refunded', 'captured', 'error'], // captured if partial refund
  refunded: [], // terminal
  declined: ['resolved'], // can be manually resolved
  error: ['resolved', 'authorized', 'captured'], // retry can fix
  resolved: [], // terminal
};

export function assertIntentTransition(
  current: PaymentIntentStatus,
  next: PaymentIntentStatus,
): void {
  const allowed = INTENT_STATUS_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new Error(
      `Invalid payment intent status transition: ${current} → ${next}. Allowed: ${allowed?.join(', ') || 'none'}`,
    );
  }
}
