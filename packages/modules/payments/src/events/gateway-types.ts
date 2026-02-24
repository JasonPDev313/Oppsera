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
  // ── ACH-specific events ──
  ACH_ORIGINATED: 'payment.gateway.ach_originated.v1',
  ACH_SETTLED: 'payment.gateway.ach_settled.v1',
  ACH_RETURNED: 'payment.gateway.ach_returned.v1',
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

// ── ACH Event Payloads ──────────────────────────────────────────

export interface AchOriginatedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  currency: string;
  orderId: string | null;
  customerId: string | null;
  providerRef: string | null;
  achSecCode: string;
  achAccountType: string;
  bankLast4: string | null;
}

export interface AchSettledPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  settledAt: string; // ISO 8601
  fundingDate: string; // YYYY-MM-DD
  providerRef: string | null;
}

export interface AchReturnedPayload {
  paymentIntentId: string;
  tenantId: string;
  locationId: string;
  merchantAccountId: string;
  amountCents: number;
  returnCode: string; // R01, R02, etc.
  returnReason: string;
  returnDate: string; // YYYY-MM-DD
  providerRef: string | null;
  orderId: string | null;
  customerId: string | null;
  achReturnId: string; // ID of the ach_returns row
  isRetryable: boolean;
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
  | 'unknown_at_gateway'
  | 'resolved'
  // ── ACH-specific statuses ──
  | 'ach_pending'
  | 'ach_originated'
  | 'ach_settled'
  | 'ach_returned';

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
  'unknown_at_gateway',
  'resolved',
  'ach_pending',
  'ach_originated',
  'ach_settled',
  'ach_returned',
];

// Status transitions allowed
export const INTENT_STATUS_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  created: ['authorized', 'captured', 'declined', 'error', 'unknown_at_gateway', 'ach_pending'],
  authorized: ['capture_pending', 'captured', 'voided', 'error'],
  capture_pending: ['captured', 'error'],
  captured: ['voided', 'refund_pending', 'refunded'],
  voided: [], // terminal
  refund_pending: ['refunded', 'captured', 'error'], // captured if partial refund
  refunded: [], // terminal
  declined: ['resolved'], // can be manually resolved
  error: ['resolved', 'authorized', 'captured'], // retry can fix
  unknown_at_gateway: ['authorized', 'captured', 'voided', 'declined', 'resolved', 'error'], // inquire/reconciliation resolves
  resolved: [], // terminal
  // ── ACH-specific transitions ──
  ach_pending: ['ach_originated', 'ach_returned', 'voided', 'error'], // accepted or bank-rejected
  ach_originated: ['ach_settled', 'ach_returned', 'error'], // funds in flight → settled or returned
  ach_settled: ['ach_returned'], // returns can arrive 60+ days after settlement
  ach_returned: ['resolved'], // manual resolution of returned ACH
};

// ── ACH Settlement Status (mirrors DB ach_settlement_status) ─────

export type AchSettlementStatus = 'pending' | 'originated' | 'settled' | 'returned';

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
