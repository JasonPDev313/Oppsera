import { describe, it, expect } from 'vitest';
import {
  SoftLockHeldError,
  SoftLockNotFoundError,
  SoftLockExpiredError,
  TerminalSessionNotFoundError,
} from '../errors';

describe('Session 13 Errors', () => {
  it('SoftLockHeldError is 409', () => {
    const error = new SoftLockHeldError('tab', 'tab_01', 'user_02');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('SOFT_LOCK_HELD');
    expect(error.message).toContain('tab_01');
    expect(error.message).toContain('user_02');
  });

  it('SoftLockNotFoundError is 404', () => {
    const error = new SoftLockNotFoundError('lock_01');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('SOFT_LOCK_NOT_FOUND');
    expect(error.message).toContain('lock_01');
  });

  it('SoftLockExpiredError is 410', () => {
    const error = new SoftLockExpiredError('lock_01');
    expect(error.statusCode).toBe(410);
    expect(error.code).toBe('SOFT_LOCK_EXPIRED');
    expect(error.message).toContain('lock_01');
  });

  it('TerminalSessionNotFoundError is 404', () => {
    const error = new TerminalSessionNotFoundError('sess_01');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('TERMINAL_SESSION_NOT_FOUND');
    expect(error.message).toContain('sess_01');
  });
});
