import { describe, it, expect } from 'vitest';
import {
  TabNotFoundError,
  TabStatusConflictError,
  TabVersionConflictError,
  CourseNotFoundError,
  CourseStatusConflictError,
} from '../errors';

describe('Session 3 Errors', () => {
  describe('TabNotFoundError', () => {
    it('creates with correct properties', () => {
      const err = new TabNotFoundError('tab-123');
      expect(err.code).toBe('TAB_NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('tab-123');
    });
  });

  describe('TabStatusConflictError', () => {
    it('creates with correct properties', () => {
      const err = new TabStatusConflictError('tab-1', 'closed', 'update');
      expect(err.code).toBe('TAB_STATUS_CONFLICT');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('closed');
      expect(err.message).toContain('update');
    });
  });

  describe('TabVersionConflictError', () => {
    it('creates with correct properties', () => {
      const err = new TabVersionConflictError('tab-1');
      expect(err.code).toBe('TAB_VERSION_CONFLICT');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('modified by another user');
    });
  });

  describe('CourseNotFoundError', () => {
    it('creates with correct properties', () => {
      const err = new CourseNotFoundError('tab-1', 3);
      expect(err.code).toBe('COURSE_NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('Course 3');
      expect(err.message).toContain('tab-1');
    });
  });

  describe('CourseStatusConflictError', () => {
    it('creates with correct properties', () => {
      const err = new CourseStatusConflictError(2, 'served', 'fire');
      expect(err.code).toBe('COURSE_STATUS_CONFLICT');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('course 2');
      expect(err.message).toContain('served');
      expect(err.message).toContain('fire');
    });
  });
});
