import { describe, it, expect } from 'vitest';
import {
  GlPostingFailedError,
  GlMappingNotFoundError,
  BatchAlreadyPostedError,
  BatchNotPostedError,
} from '../errors';

describe('Session 11 Errors', () => {
  it('GlPostingFailedError has code, message, 500 status', () => {
    const err = new GlPostingFailedError('batch-1', 'Unbalanced journal');
    expect(err.code).toBe('GL_POSTING_FAILED');
    expect(err.message).toContain('batch-1');
    expect(err.message).toContain('Unbalanced journal');
    expect(err.statusCode).toBe(500);
  });

  it('GlMappingNotFoundError has code, message, 404 status', () => {
    const err = new GlMappingNotFoundError('department', 'dept-food');
    expect(err.code).toBe('GL_MAPPING_NOT_FOUND');
    expect(err.message).toContain('department');
    expect(err.message).toContain('dept-food');
    expect(err.statusCode).toBe(404);
  });

  it('BatchAlreadyPostedError has code, message, 409 status', () => {
    const err = new BatchAlreadyPostedError('batch-1');
    expect(err.code).toBe('BATCH_ALREADY_POSTED');
    expect(err.message).toContain('batch-1');
    expect(err.statusCode).toBe(409);
  });

  it('BatchNotPostedError has code, message, 409 status', () => {
    const err = new BatchNotPostedError('batch-1');
    expect(err.code).toBe('BATCH_NOT_POSTED');
    expect(err.message).toContain('batch-1');
    expect(err.statusCode).toBe(409);
  });
});
