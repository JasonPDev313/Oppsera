import { describe, it, expect } from 'vitest';
import {
  CONFIDENCE_THRESHOLDS,
  ANSWER_MODES,
  CONFIDENCE_LEVELS,
  THREAD_CHANNELS,
  THREAD_STATUSES,
  QUESTION_TYPES,
  OUTCOMES,
  ISSUE_TAGS,
  MESSAGE_ROLES,
  FEEDBACK_RATINGS,
  REVIEW_STATUSES,
  SOURCE_TIERS,
  ANSWER_CARD_STATUSES,
  DOCUMENT_SOURCE_TYPES,
  FEEDBACK_REASON_CODES,
  MAX_MESSAGES_PER_THREAD,
  MAX_CONCURRENT_THREADS_PER_USER,
  MAX_MESSAGES_PER_HOUR,
  MAX_MESSAGE_LENGTH,
  MAX_FREEFORM_COMMENT_LENGTH,
} from '../constants';

describe('constants', () => {
  describe('constant arrays are non-empty', () => {
    it('ANSWER_MODES is non-empty', () => {
      expect(ANSWER_MODES.length).toBeGreaterThan(0);
    });

    it('CONFIDENCE_LEVELS is non-empty', () => {
      expect(CONFIDENCE_LEVELS.length).toBeGreaterThan(0);
    });

    it('THREAD_CHANNELS is non-empty', () => {
      expect(THREAD_CHANNELS.length).toBeGreaterThan(0);
    });

    it('THREAD_STATUSES is non-empty', () => {
      expect(THREAD_STATUSES.length).toBeGreaterThan(0);
    });

    it('QUESTION_TYPES is non-empty', () => {
      expect(QUESTION_TYPES.length).toBeGreaterThan(0);
    });

    it('OUTCOMES is non-empty', () => {
      expect(OUTCOMES.length).toBeGreaterThan(0);
    });

    it('ISSUE_TAGS is non-empty', () => {
      expect(ISSUE_TAGS.length).toBeGreaterThan(0);
    });

    it('MESSAGE_ROLES is non-empty', () => {
      expect(MESSAGE_ROLES.length).toBeGreaterThan(0);
    });

    it('FEEDBACK_RATINGS is non-empty', () => {
      expect(FEEDBACK_RATINGS.length).toBeGreaterThan(0);
    });

    it('REVIEW_STATUSES is non-empty', () => {
      expect(REVIEW_STATUSES.length).toBeGreaterThan(0);
    });

    it('SOURCE_TIERS is non-empty', () => {
      expect(SOURCE_TIERS.length).toBeGreaterThan(0);
    });

    it('ANSWER_CARD_STATUSES is non-empty', () => {
      expect(ANSWER_CARD_STATUSES.length).toBeGreaterThan(0);
    });

    it('DOCUMENT_SOURCE_TYPES is non-empty', () => {
      expect(DOCUMENT_SOURCE_TYPES.length).toBeGreaterThan(0);
    });

    it('FEEDBACK_REASON_CODES is non-empty', () => {
      expect(FEEDBACK_REASON_CODES.length).toBeGreaterThan(0);
    });
  });

  describe('enum values are unique', () => {
    function allUnique(arr: readonly string[]): boolean {
      return new Set(arr).size === arr.length;
    }

    it('ANSWER_MODES has no duplicates', () => {
      expect(allUnique(ANSWER_MODES)).toBe(true);
    });

    it('CONFIDENCE_LEVELS has no duplicates', () => {
      expect(allUnique(CONFIDENCE_LEVELS)).toBe(true);
    });

    it('THREAD_CHANNELS has no duplicates', () => {
      expect(allUnique(THREAD_CHANNELS)).toBe(true);
    });

    it('THREAD_STATUSES has no duplicates', () => {
      expect(allUnique(THREAD_STATUSES)).toBe(true);
    });

    it('QUESTION_TYPES has no duplicates', () => {
      expect(allUnique(QUESTION_TYPES)).toBe(true);
    });

    it('OUTCOMES has no duplicates', () => {
      expect(allUnique(OUTCOMES)).toBe(true);
    });

    it('ISSUE_TAGS has no duplicates', () => {
      expect(allUnique(ISSUE_TAGS)).toBe(true);
    });

    it('MESSAGE_ROLES has no duplicates', () => {
      expect(allUnique(MESSAGE_ROLES)).toBe(true);
    });

    it('FEEDBACK_RATINGS has no duplicates', () => {
      expect(allUnique(FEEDBACK_RATINGS)).toBe(true);
    });

    it('REVIEW_STATUSES has no duplicates', () => {
      expect(allUnique(REVIEW_STATUSES)).toBe(true);
    });

    it('SOURCE_TIERS has no duplicates', () => {
      expect(allUnique(SOURCE_TIERS)).toBe(true);
    });

    it('ANSWER_CARD_STATUSES has no duplicates', () => {
      expect(allUnique(ANSWER_CARD_STATUSES)).toBe(true);
    });

    it('DOCUMENT_SOURCE_TYPES has no duplicates', () => {
      expect(allUnique(DOCUMENT_SOURCE_TYPES)).toBe(true);
    });

    it('FEEDBACK_REASON_CODES has no duplicates', () => {
      expect(allUnique(FEEDBACK_REASON_CODES)).toBe(true);
    });
  });

  describe('CONFIDENCE_THRESHOLDS', () => {
    it('HIGH >= MEDIUM', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.MEDIUM);
    });

    it('MEDIUM >= LOW', () => {
      expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.LOW);
    });

    it('HIGH is between 0 and 1', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBeGreaterThan(0);
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBeLessThanOrEqual(1);
    });
  });

  describe('numeric limits are positive', () => {
    it('MAX_MESSAGES_PER_THREAD > 0', () => {
      expect(MAX_MESSAGES_PER_THREAD).toBeGreaterThan(0);
    });

    it('MAX_CONCURRENT_THREADS_PER_USER > 0', () => {
      expect(MAX_CONCURRENT_THREADS_PER_USER).toBeGreaterThan(0);
    });

    it('MAX_MESSAGES_PER_HOUR > 0', () => {
      expect(MAX_MESSAGES_PER_HOUR).toBeGreaterThan(0);
    });

    it('MAX_MESSAGE_LENGTH > 0', () => {
      expect(MAX_MESSAGE_LENGTH).toBeGreaterThan(0);
    });

    it('MAX_FREEFORM_COMMENT_LENGTH > 0', () => {
      expect(MAX_FREEFORM_COMMENT_LENGTH).toBeGreaterThan(0);
    });
  });
});
