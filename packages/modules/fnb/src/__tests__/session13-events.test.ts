import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  SoftLockAcquiredPayload,
  SoftLockReleasedPayload,
  TerminalConnectedPayload,
  TerminalDisconnectedPayload,
} from '../events/types';

describe('Session 13 Events', () => {
  it('SOFT_LOCK_ACQUIRED is defined', () => {
    expect(FNB_EVENTS.SOFT_LOCK_ACQUIRED).toBe('fnb.lock.acquired.v1');
  });

  it('SOFT_LOCK_RELEASED is defined', () => {
    expect(FNB_EVENTS.SOFT_LOCK_RELEASED).toBe('fnb.lock.released.v1');
  });

  it('TERMINAL_CONNECTED is defined', () => {
    expect(FNB_EVENTS.TERMINAL_CONNECTED).toBe('fnb.terminal.connected.v1');
  });

  it('TERMINAL_DISCONNECTED is defined', () => {
    expect(FNB_EVENTS.TERMINAL_DISCONNECTED).toBe('fnb.terminal.disconnected.v1');
  });
});

describe('Session 13 Payload Types', () => {
  it('SoftLockAcquiredPayload shape', () => {
    const payload: SoftLockAcquiredPayload = {
      lockId: 'lock_01',
      entityType: 'tab',
      entityId: 'tab_01',
      lockedBy: 'user_01',
      terminalId: 'term_01',
      expiresAt: '2026-02-21T12:00:00Z',
    };
    expect(payload.lockId).toBe('lock_01');
    expect(payload.entityType).toBe('tab');
    expect(payload.terminalId).toBe('term_01');
  });

  it('SoftLockReleasedPayload shape', () => {
    const payload: SoftLockReleasedPayload = {
      lockId: 'lock_01',
      entityType: 'tab',
      entityId: 'tab_01',
      releasedBy: 'user_01',
      forced: false,
    };
    expect(payload.forced).toBe(false);
  });

  it('TerminalConnectedPayload shape', () => {
    const payload: TerminalConnectedPayload = {
      sessionId: 'sess_01',
      terminalId: 'term_01',
      locationId: 'loc_01',
      userId: 'user_01',
      subscribedChannels: ['fnb:tenant1:location:loc_01', 'fnb:tenant1:terminal:term_01'],
    };
    expect(payload.subscribedChannels).toHaveLength(2);
  });

  it('TerminalDisconnectedPayload shape', () => {
    const payload: TerminalDisconnectedPayload = {
      sessionId: 'sess_01',
      terminalId: 'term_01',
      locationId: 'loc_01',
      userId: 'user_01',
      locksReleased: 3,
    };
    expect(payload.locksReleased).toBe(3);
  });
});
