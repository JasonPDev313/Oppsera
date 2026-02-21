import { describe, it, expect } from 'vitest';
import {
  OFFLINE_ALLOWED_OPERATIONS,
  OFFLINE_BLOCKED_OPERATIONS,
  isOfflineAllowed,
  DEFAULT_MAX_OFFLINE_QUEUE_SIZE,
} from '../helpers/offline-queue-types';
import type {
  OfflineQueueItem,
  OfflineQueueState,
  OfflineAllowedOperation,
  OfflineBlockedOperation,
} from '../helpers/offline-queue-types';

describe('OFFLINE_ALLOWED_OPERATIONS', () => {
  it('has 5 allowed operations', () => {
    expect(OFFLINE_ALLOWED_OPERATIONS).toHaveLength(5);
  });

  it('includes tab.add_item', () => {
    expect(OFFLINE_ALLOWED_OPERATIONS).toContain('tab.add_item');
  });

  it('includes course.send', () => {
    expect(OFFLINE_ALLOWED_OPERATIONS).toContain('course.send');
  });

  it('includes tab.update_note', () => {
    expect(OFFLINE_ALLOWED_OPERATIONS).toContain('tab.update_note');
  });
});

describe('OFFLINE_BLOCKED_OPERATIONS', () => {
  it('has 6 blocked operations', () => {
    expect(OFFLINE_BLOCKED_OPERATIONS).toHaveLength(6);
  });

  it('includes payment.process', () => {
    expect(OFFLINE_BLOCKED_OPERATIONS).toContain('payment.process');
  });

  it('includes tab.void', () => {
    expect(OFFLINE_BLOCKED_OPERATIONS).toContain('tab.void');
  });

  it('includes preauth.capture', () => {
    expect(OFFLINE_BLOCKED_OPERATIONS).toContain('preauth.capture');
  });
});

describe('isOfflineAllowed', () => {
  it('returns true for allowed operations', () => {
    expect(isOfflineAllowed('tab.add_item')).toBe(true);
    expect(isOfflineAllowed('tab.remove_item')).toBe(true);
    expect(isOfflineAllowed('tab.update_item')).toBe(true);
    expect(isOfflineAllowed('course.send')).toBe(true);
    expect(isOfflineAllowed('tab.update_note')).toBe(true);
  });

  it('returns false for blocked operations', () => {
    expect(isOfflineAllowed('payment.process')).toBe(false);
    expect(isOfflineAllowed('tab.void')).toBe(false);
    expect(isOfflineAllowed('batch.close')).toBe(false);
    expect(isOfflineAllowed('kds.bump')).toBe(false);
  });

  it('returns false for unknown operations', () => {
    expect(isOfflineAllowed('unknown.operation')).toBe(false);
  });
});

describe('DEFAULT_MAX_OFFLINE_QUEUE_SIZE', () => {
  it('is 50', () => {
    expect(DEFAULT_MAX_OFFLINE_QUEUE_SIZE).toBe(50);
  });
});

describe('OfflineQueueItem type', () => {
  it('has correct shape', () => {
    const item: OfflineQueueItem = {
      id: 'q_01',
      timestamp: Date.now(),
      endpoint: 'POST /api/v1/fnb/tabs/tab_01/add-item',
      method: 'POST',
      body: { itemId: 'item_01', qty: 1 },
      tabId: 'tab_01',
      expectedVersion: 3,
      status: 'pending',
      retryCount: 0,
    };
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(0);
    expect(item.error).toBeUndefined();
  });

  it('accepts error field', () => {
    const item: OfflineQueueItem = {
      id: 'q_02',
      timestamp: Date.now(),
      endpoint: 'PATCH /api/v1/fnb/tabs/tab_01/update',
      method: 'PATCH',
      body: { note: 'updated' },
      tabId: 'tab_01',
      expectedVersion: 4,
      status: 'conflict',
      error: 'Version mismatch',
      retryCount: 2,
    };
    expect(item.status).toBe('conflict');
    expect(item.error).toBe('Version mismatch');
  });
});

describe('OfflineQueueState type', () => {
  it('has correct shape', () => {
    const state: OfflineQueueState = {
      items: [],
      isOnline: true,
      conflictedItems: [],
    };
    expect(state.isOnline).toBe(true);
    expect(state.lastSyncAt).toBeUndefined();
  });
});

describe('Type alias checks', () => {
  it('OfflineAllowedOperation is a string literal type', () => {
    const op: OfflineAllowedOperation = 'tab.add_item';
    expect(op).toBe('tab.add_item');
  });

  it('OfflineBlockedOperation is a string literal type', () => {
    const op: OfflineBlockedOperation = 'payment.process';
    expect(op).toBe('payment.process');
  });
});
