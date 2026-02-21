import { describe, it, expect } from 'vitest';
import {
  CloseBatchNotFoundError,
  CloseBatchStatusConflictError,
  OpenTabsExistError,
  ServerCheckoutNotFoundError,
  DepositSlipNotFoundError,
} from '../errors';

describe('Session 10 Errors', () => {
  it('CloseBatchNotFoundError has code, message, 404 status', () => {
    const err = new CloseBatchNotFoundError('batch-1');
    expect(err.code).toBe('CLOSE_BATCH_NOT_FOUND');
    expect(err.message).toContain('batch-1');
    expect(err.statusCode).toBe(404);
  });

  it('CloseBatchStatusConflictError has code, message, 409 status', () => {
    const err = new CloseBatchStatusConflictError('batch-1', 'locked', 'reconciled');
    expect(err.code).toBe('CLOSE_BATCH_STATUS_CONFLICT');
    expect(err.message).toContain('batch-1');
    expect(err.message).toContain('locked');
    expect(err.message).toContain('reconciled');
    expect(err.statusCode).toBe(409);
  });

  it('OpenTabsExistError has code, message, 409 status', () => {
    const err = new OpenTabsExistError('loc-1', 3);
    expect(err.code).toBe('OPEN_TABS_EXIST');
    expect(err.message).toContain('loc-1');
    expect(err.message).toContain('3');
    expect(err.statusCode).toBe(409);
  });

  it('ServerCheckoutNotFoundError has code, message, 404 status', () => {
    const err = new ServerCheckoutNotFoundError('co-1');
    expect(err.code).toBe('SERVER_CHECKOUT_NOT_FOUND');
    expect(err.message).toContain('co-1');
    expect(err.statusCode).toBe(404);
  });

  it('DepositSlipNotFoundError has code, message, 404 status', () => {
    const err = new DepositSlipNotFoundError('batch-1');
    expect(err.code).toBe('DEPOSIT_SLIP_NOT_FOUND');
    expect(err.message).toContain('batch-1');
    expect(err.statusCode).toBe(404);
  });
});
