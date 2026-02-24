import { describe, it, expect } from 'vitest';

import {
  assertIntentTransition,
  INTENT_STATUS_TRANSITIONS,
  VALID_INTENT_STATUSES,
  type PaymentIntentStatus,
} from '../events/gateway-types';

import { inquirePaymentSchema } from '../gateway-validation';

// ── unknown_at_gateway status ────────────────────────────────

describe('unknown_at_gateway intent status', () => {
  it('should be included in VALID_INTENT_STATUSES', () => {
    expect(VALID_INTENT_STATUSES).toContain('unknown_at_gateway');
  });

  it('should have transitions defined', () => {
    expect(INTENT_STATUS_TRANSITIONS['unknown_at_gateway']).toBeDefined();
  });

  it('should allow created → unknown_at_gateway', () => {
    expect(() => assertIntentTransition('created', 'unknown_at_gateway')).not.toThrow();
  });

  it('should allow unknown_at_gateway → authorized', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'authorized')).not.toThrow();
  });

  it('should allow unknown_at_gateway → captured', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'captured')).not.toThrow();
  });

  it('should allow unknown_at_gateway → voided', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'voided')).not.toThrow();
  });

  it('should allow unknown_at_gateway → declined', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'declined')).not.toThrow();
  });

  it('should allow unknown_at_gateway → resolved', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'resolved')).not.toThrow();
  });

  it('should allow unknown_at_gateway → error', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'error')).not.toThrow();
  });

  it('should reject unknown_at_gateway → refunded (no direct path)', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'refunded')).toThrow();
  });

  it('should reject unknown_at_gateway → refund_pending', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'refund_pending')).toThrow();
  });

  it('should reject unknown_at_gateway → capture_pending', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'capture_pending')).toThrow();
  });
});

// ── Void idempotency: voided → voided is a no-op ────────────

describe('void idempotency via terminal status', () => {
  it('voided is a terminal state — no transitions allowed OUT of voided', () => {
    const transitions = INTENT_STATUS_TRANSITIONS['voided'];
    expect(transitions).toEqual([]);
  });

  it('assertIntentTransition rejects voided → anything', () => {
    const allStatuses: PaymentIntentStatus[] = [
      'created', 'authorized', 'capture_pending', 'captured',
      'voided', 'refund_pending', 'refunded', 'declined',
      'error', 'unknown_at_gateway', 'resolved',
    ];
    for (const next of allStatuses) {
      expect(() => assertIntentTransition('voided', next)).toThrow();
    }
  });

  it('captured → voided is a valid transition (pre-void)', () => {
    expect(() => assertIntentTransition('captured', 'voided')).not.toThrow();
  });

  it('authorized → voided is a valid transition', () => {
    expect(() => assertIntentTransition('authorized', 'voided')).not.toThrow();
  });
});

// ── Refund idempotency: requires clientRequestId ─────────────

describe('refund idempotency via clientRequestId', () => {
  it('refunded is a terminal state — no transitions out', () => {
    expect(INTENT_STATUS_TRANSITIONS['refunded']).toEqual([]);
  });

  it('captured → refunded is valid', () => {
    expect(() => assertIntentTransition('captured', 'refunded')).not.toThrow();
  });

  it('captured → refund_pending is valid (partial refund staging)', () => {
    expect(() => assertIntentTransition('captured', 'refund_pending')).not.toThrow();
  });

  it('refund_pending → refunded is valid', () => {
    expect(() => assertIntentTransition('refund_pending', 'refunded')).not.toThrow();
  });

  it('refund_pending → captured is valid (partial refund completed, more available)', () => {
    expect(() => assertIntentTransition('refund_pending', 'captured')).not.toThrow();
  });
});

// ── Inquire schema updates ───────────────────────────────────

describe('inquire schema with optional clientRequestId', () => {
  it('should accept paymentIntentId only', () => {
    const result = inquirePaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
    });
    expect(result.success).toBe(true);
  });

  it('should accept with clientRequestId', () => {
    const result = inquirePaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      clientRequestId: 'inq-123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clientRequestId).toBe('inq-123');
    }
  });

  it('should reject empty clientRequestId', () => {
    const result = inquirePaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      clientRequestId: '',
    });
    expect(result.success).toBe(false);
  });
});

// ── Inquire status auto-resolution transitions ───────────────

describe('inquire auto-resolution transitions', () => {
  it('error → authorized is valid (inquire found approved auth)', () => {
    expect(() => assertIntentTransition('error', 'authorized')).not.toThrow();
  });

  it('error → captured is valid (inquire found approved sale)', () => {
    expect(() => assertIntentTransition('error', 'captured')).not.toThrow();
  });

  it('error → resolved is valid (manual resolution)', () => {
    expect(() => assertIntentTransition('error', 'resolved')).not.toThrow();
  });

  it('unknown_at_gateway → authorized is valid (inquire found approved auth)', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'authorized')).not.toThrow();
  });

  it('unknown_at_gateway → captured is valid (inquire found approved sale)', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'captured')).not.toThrow();
  });

  it('unknown_at_gateway → declined is valid (inquire found declined)', () => {
    expect(() => assertIntentTransition('unknown_at_gateway', 'declined')).not.toThrow();
  });

  it('declined → resolved is valid (manual resolution after decline)', () => {
    expect(() => assertIntentTransition('declined', 'resolved')).not.toThrow();
  });
});

// ── Complete transition matrix ───────────────────────────────

describe('complete intent status transition matrix', () => {
  it('all statuses in VALID_INTENT_STATUSES have entries in INTENT_STATUS_TRANSITIONS', () => {
    for (const status of VALID_INTENT_STATUSES) {
      expect(INTENT_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('all transition targets are valid statuses', () => {
    for (const [from, targets] of Object.entries(INTENT_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(VALID_INTENT_STATUSES).toContain(target);
      }
    }
  });

  it('terminal states have empty transitions', () => {
    const terminalStates: PaymentIntentStatus[] = ['voided', 'refunded', 'resolved'];
    for (const state of terminalStates) {
      expect(INTENT_STATUS_TRANSITIONS[state]).toEqual([]);
    }
  });

  it('unknown_at_gateway has 6 outbound transitions', () => {
    const transitions = INTENT_STATUS_TRANSITIONS['unknown_at_gateway'];
    expect(transitions.length).toBe(6);
  });
});
