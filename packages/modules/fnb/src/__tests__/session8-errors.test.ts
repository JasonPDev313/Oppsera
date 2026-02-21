import { describe, it, expect } from 'vitest';
import {
  PreauthNotFoundError,
  PreauthStatusConflictError,
  PreauthAmountExceededError,
  TipAdjustmentWindowClosedError,
  TipAlreadyFinalizedError,
} from '../errors';

describe('Session 8 Errors', () => {
  it('PreauthNotFoundError has code, message, 404 status', () => {
    const err = new PreauthNotFoundError('pre-1');
    expect(err.code).toBe('PREAUTH_NOT_FOUND');
    expect(err.message).toContain('pre-1');
    expect(err.statusCode).toBe(404);
  });

  it('PreauthStatusConflictError has code, message, 409 status', () => {
    const err = new PreauthStatusConflictError('pre-1', 'captured', 'void');
    expect(err.code).toBe('PREAUTH_STATUS_CONFLICT');
    expect(err.message).toContain('pre-1');
    expect(err.message).toContain('captured');
    expect(err.message).toContain('void');
    expect(err.statusCode).toBe(409);
  });

  it('PreauthAmountExceededError has code, message, 400 status', () => {
    const err = new PreauthAmountExceededError('pre-1', 5000, 7000);
    expect(err.code).toBe('PREAUTH_AMOUNT_EXCEEDED');
    expect(err.message).toContain('pre-1');
    expect(err.message).toContain('7000');
    expect(err.message).toContain('5000');
    expect(err.statusCode).toBe(400);
  });

  it('TipAdjustmentWindowClosedError has code, message, 400 status', () => {
    const err = new TipAdjustmentWindowClosedError('pre-1');
    expect(err.code).toBe('TIP_ADJUSTMENT_WINDOW_CLOSED');
    expect(err.message).toContain('pre-1');
    expect(err.statusCode).toBe(400);
  });

  it('TipAlreadyFinalizedError has code, message, 409 status', () => {
    const err = new TipAlreadyFinalizedError('tab-1');
    expect(err.code).toBe('TIP_ALREADY_FINALIZED');
    expect(err.message).toContain('tab-1');
    expect(err.statusCode).toBe(409);
  });
});
