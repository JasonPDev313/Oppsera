import { describe, it, expect } from 'vitest';
import {
  TipPoolNotFoundError,
  TipPoolParticipantExistsError,
  TipDeclarationExistsError,
  TipDeclarationBelowMinimumError,
} from '../errors';

describe('Session 9 Errors', () => {
  it('TipPoolNotFoundError has code, message, 404 status', () => {
    const err = new TipPoolNotFoundError('pool-1');
    expect(err.code).toBe('TIP_POOL_NOT_FOUND');
    expect(err.message).toContain('pool-1');
    expect(err.statusCode).toBe(404);
  });

  it('TipPoolParticipantExistsError has code, message, 409 status', () => {
    const err = new TipPoolParticipantExistsError('pool-1', 'role-server');
    expect(err.code).toBe('TIP_POOL_PARTICIPANT_EXISTS');
    expect(err.message).toContain('pool-1');
    expect(err.message).toContain('role-server');
    expect(err.statusCode).toBe(409);
  });

  it('TipDeclarationExistsError has code, message, 409 status', () => {
    const err = new TipDeclarationExistsError('user-1', '2026-02-21');
    expect(err.code).toBe('TIP_DECLARATION_EXISTS');
    expect(err.message).toContain('user-1');
    expect(err.message).toContain('2026-02-21');
    expect(err.statusCode).toBe(409);
  });

  it('TipDeclarationBelowMinimumError has code, message, 400 status', () => {
    const err = new TipDeclarationBelowMinimumError('5.50', '8.00');
    expect(err.code).toBe('TIP_DECLARATION_BELOW_MINIMUM');
    expect(err.message).toContain('5.50');
    expect(err.message).toContain('8.00');
    expect(err.statusCode).toBe(400);
  });
});
