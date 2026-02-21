import { describe, it, expect } from 'vitest';
import {
  PaymentSessionNotFoundError,
  PaymentSessionStatusConflictError,
  SplitNotAllowedError,
  AutoGratuityRuleNotFoundError,
  CheckAlreadyPaidError,
  RefundExceedsTenderError,
} from '../errors';

describe('Session 7 Errors', () => {
  it('PaymentSessionNotFoundError has code, message, 404 status', () => {
    const err = new PaymentSessionNotFoundError('sess-1');
    expect(err.code).toBe('PAYMENT_SESSION_NOT_FOUND');
    expect(err.message).toContain('sess-1');
    expect(err.statusCode).toBe(404);
  });

  it('PaymentSessionStatusConflictError has code, message, 409 status', () => {
    const err = new PaymentSessionStatusConflictError('sess-1', 'completed', 'retry');
    expect(err.code).toBe('PAYMENT_SESSION_STATUS_CONFLICT');
    expect(err.message).toContain('sess-1');
    expect(err.message).toContain('completed');
    expect(err.message).toContain('retry');
    expect(err.statusCode).toBe(409);
  });

  it('SplitNotAllowedError has code, message, 400 status', () => {
    const err = new SplitNotAllowedError('tab-1', 'tab is in status closed');
    expect(err.code).toBe('SPLIT_NOT_ALLOWED');
    expect(err.message).toContain('tab-1');
    expect(err.message).toContain('closed');
    expect(err.statusCode).toBe(400);
  });

  it('AutoGratuityRuleNotFoundError has code, message, 404 status', () => {
    const err = new AutoGratuityRuleNotFoundError('rule-1');
    expect(err.code).toBe('AUTO_GRATUITY_RULE_NOT_FOUND');
    expect(err.message).toContain('rule-1');
    expect(err.statusCode).toBe(404);
  });

  it('CheckAlreadyPaidError has code, message, 409 status', () => {
    const err = new CheckAlreadyPaidError('order-1');
    expect(err.code).toBe('CHECK_ALREADY_PAID');
    expect(err.message).toContain('order-1');
    expect(err.statusCode).toBe(409);
  });

  it('RefundExceedsTenderError has code, message, 400 status', () => {
    const err = new RefundExceedsTenderError('tender-1');
    expect(err.code).toBe('REFUND_EXCEEDS_TENDER');
    expect(err.message).toContain('tender-1');
    expect(err.statusCode).toBe(400);
  });
});
