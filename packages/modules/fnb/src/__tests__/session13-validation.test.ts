import { describe, it, expect } from 'vitest';
import {
  SOFT_LOCK_ENTITY_TYPES,
  CHANNEL_TYPES,
  OFFLINE_QUEUE_STATUSES,
  acquireSoftLockSchema,
  renewSoftLockSchema,
  releaseSoftLockSchema,
  forceReleaseSoftLockSchema,
  cleanExpiredLocksSchema,
  createTerminalSessionSchema,
  heartbeatTerminalSessionSchema,
  disconnectTerminalSessionSchema,
  getActiveLockSchema,
  listActiveLocksSchema,
  listTerminalLocksSchema,
} from '../validation';

describe('Session 13 Enums', () => {
  it('SOFT_LOCK_ENTITY_TYPES has 3 entries', () => {
    expect(SOFT_LOCK_ENTITY_TYPES).toEqual(['tab', 'table', 'ticket']);
  });

  it('CHANNEL_TYPES has 5 entries', () => {
    expect(CHANNEL_TYPES).toEqual(['location', 'terminal', 'station', 'floor', 'tab']);
  });

  it('OFFLINE_QUEUE_STATUSES has 5 entries', () => {
    expect(OFFLINE_QUEUE_STATUSES).toEqual(['pending', 'syncing', 'synced', 'conflict', 'rejected']);
  });
});

describe('acquireSoftLockSchema', () => {
  it('validates valid input', () => {
    const result = acquireSoftLockSchema.safeParse({
      entityType: 'tab',
      entityId: 'tab_01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlSeconds).toBe(30); // default
    }
  });

  it('accepts custom ttlSeconds', () => {
    const result = acquireSoftLockSchema.safeParse({
      entityType: 'table',
      entityId: 'tbl_01',
      ttlSeconds: 120,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlSeconds).toBe(120);
    }
  });

  it('rejects invalid entityType', () => {
    const result = acquireSoftLockSchema.safeParse({
      entityType: 'invalid',
      entityId: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ttlSeconds below 5', () => {
    const result = acquireSoftLockSchema.safeParse({
      entityType: 'tab',
      entityId: 'tab_01',
      ttlSeconds: 2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ttlSeconds above 300', () => {
    const result = acquireSoftLockSchema.safeParse({
      entityType: 'tab',
      entityId: 'tab_01',
      ttlSeconds: 500,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional terminalId', () => {
    const result = acquireSoftLockSchema.safeParse({
      entityType: 'ticket',
      entityId: 'tk_01',
      terminalId: 'term_01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.terminalId).toBe('term_01');
    }
  });
});

describe('renewSoftLockSchema', () => {
  it('validates valid input with default ttl', () => {
    const result = renewSoftLockSchema.safeParse({
      lockId: 'lock_01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlSeconds).toBe(30);
    }
  });

  it('rejects empty lockId', () => {
    const result = renewSoftLockSchema.safeParse({
      lockId: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('releaseSoftLockSchema', () => {
  it('validates valid input', () => {
    const result = releaseSoftLockSchema.safeParse({ lockId: 'lock_01' });
    expect(result.success).toBe(true);
  });

  it('rejects missing lockId', () => {
    const result = releaseSoftLockSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('forceReleaseSoftLockSchema', () => {
  it('validates valid input', () => {
    const result = forceReleaseSoftLockSchema.safeParse({
      entityType: 'table',
      entityId: 'tbl_01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid entityType', () => {
    const result = forceReleaseSoftLockSchema.safeParse({
      entityType: 'order',
      entityId: 'ord_01',
    });
    expect(result.success).toBe(false);
  });
});

describe('cleanExpiredLocksSchema', () => {
  it('validates valid input', () => {
    const result = cleanExpiredLocksSchema.safeParse({ tenantId: 'tenant_01' });
    expect(result.success).toBe(true);
  });

  it('rejects empty tenantId', () => {
    const result = cleanExpiredLocksSchema.safeParse({ tenantId: '' });
    expect(result.success).toBe(false);
  });
});

describe('Terminal Session Schemas', () => {
  it('createTerminalSessionSchema validates', () => {
    const result = createTerminalSessionSchema.safeParse({
      terminalId: 'term_01',
      locationId: 'loc_01',
    });
    expect(result.success).toBe(true);
  });

  it('heartbeatTerminalSessionSchema validates', () => {
    const result = heartbeatTerminalSessionSchema.safeParse({
      sessionId: 'sess_01',
    });
    expect(result.success).toBe(true);
  });

  it('disconnectTerminalSessionSchema validates', () => {
    const result = disconnectTerminalSessionSchema.safeParse({
      sessionId: 'sess_01',
    });
    expect(result.success).toBe(true);
  });
});

describe('Query Filter Schemas', () => {
  it('getActiveLockSchema validates', () => {
    const result = getActiveLockSchema.safeParse({
      tenantId: 'tenant_01',
      entityType: 'tab',
      entityId: 'tab_01',
    });
    expect(result.success).toBe(true);
  });

  it('listActiveLocksSchema validates with optional entityType', () => {
    const result = listActiveLocksSchema.safeParse({
      tenantId: 'tenant_01',
    });
    expect(result.success).toBe(true);
  });

  it('listActiveLocksSchema accepts entityType filter', () => {
    const result = listActiveLocksSchema.safeParse({
      tenantId: 'tenant_01',
      entityType: 'table',
    });
    expect(result.success).toBe(true);
  });

  it('listTerminalLocksSchema validates', () => {
    const result = listTerminalLocksSchema.safeParse({
      tenantId: 'tenant_01',
      terminalId: 'term_01',
    });
    expect(result.success).toBe(true);
  });

  it('listTerminalLocksSchema rejects empty terminalId', () => {
    const result = listTerminalLocksSchema.safeParse({
      tenantId: 'tenant_01',
      terminalId: '',
    });
    expect(result.success).toBe(false);
  });
});
