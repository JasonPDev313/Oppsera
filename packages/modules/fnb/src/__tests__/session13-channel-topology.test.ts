import { describe, it, expect } from 'vitest';
import {
  buildChannelName,
  parseChannelName,
  getEventChannels,
  getDefaultSubscriptions,
} from '../helpers/channel-topology';

describe('buildChannelName', () => {
  it('builds location channel', () => {
    expect(buildChannelName('t1', 'location', 'loc_01')).toBe('fnb:t1:location:loc_01');
  });

  it('builds terminal channel', () => {
    expect(buildChannelName('t1', 'terminal', 'term_01')).toBe('fnb:t1:terminal:term_01');
  });

  it('builds station channel', () => {
    expect(buildChannelName('t1', 'station', 'stn_01')).toBe('fnb:t1:station:stn_01');
  });

  it('builds floor channel', () => {
    expect(buildChannelName('t1', 'floor', 'room_01')).toBe('fnb:t1:floor:room_01');
  });

  it('builds tab channel', () => {
    expect(buildChannelName('t1', 'tab', 'tab_01')).toBe('fnb:t1:tab:tab_01');
  });
});

describe('parseChannelName', () => {
  it('parses valid channel name', () => {
    const result = parseChannelName('fnb:t1:location:loc_01');
    expect(result).toEqual({
      tenantId: 't1',
      scope: 'location',
      scopeId: 'loc_01',
    });
  });

  it('returns null for invalid prefix', () => {
    expect(parseChannelName('pos:t1:location:loc_01')).toBeNull();
  });

  it('returns null for wrong number of parts', () => {
    expect(parseChannelName('fnb:t1:location')).toBeNull();
  });

  it('returns null for too many parts', () => {
    expect(parseChannelName('fnb:t1:location:loc_01:extra')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseChannelName('')).toBeNull();
  });
});

describe('getEventChannels', () => {
  const tenantId = 'tenant_01';

  it('returns location channel for table status change', () => {
    const channels = getEventChannels(tenantId, 'fnb.table.status_changed.v1', {
      locationId: 'loc_01',
      roomId: 'room_01',
    });
    expect(channels).toContain('fnb:tenant_01:location:loc_01');
    expect(channels).toContain('fnb:tenant_01:floor:room_01');
  });

  it('returns station channel for ticket creation', () => {
    const channels = getEventChannels(tenantId, 'fnb.ticket.created.v1', {
      stationId: 'stn_01',
    });
    expect(channels).toContain('fnb:tenant_01:station:stn_01');
  });

  it('returns tab channel for tab update', () => {
    const channels = getEventChannels(tenantId, 'fnb.tab.updated.v1', {
      tabId: 'tab_01',
    });
    expect(channels).toContain('fnb:tenant_01:tab:tab_01');
  });

  it('returns terminal channel for terminal connect', () => {
    const channels = getEventChannels(tenantId, 'fnb.terminal.connected.v1', {
      terminalId: 'term_01',
    });
    expect(channels).toContain('fnb:tenant_01:terminal:term_01');
  });

  it('returns empty array when no context IDs match', () => {
    const channels = getEventChannels(tenantId, 'fnb.tab.updated.v1', {});
    expect(channels).toEqual([]);
  });

  it('returns empty array for unknown event type', () => {
    const channels = getEventChannels(tenantId, 'fnb.unknown.event.v1', {
      locationId: 'loc_01',
    });
    expect(channels).toEqual([]);
  });

  it('returns multiple channels for events in multiple scopes', () => {
    const channels = getEventChannels(tenantId, 'fnb.payment.completed.v1', {
      locationId: 'loc_01',
      tabId: 'tab_01',
    });
    expect(channels).toContain('fnb:tenant_01:location:loc_01');
    expect(channels).toContain('fnb:tenant_01:tab:tab_01');
    expect(channels).toHaveLength(2);
  });

  it('returns location channel for menu item 86d', () => {
    const channels = getEventChannels(tenantId, 'fnb.menu.item_eighty_sixed.v1', {
      locationId: 'loc_01',
    });
    expect(channels).toContain('fnb:tenant_01:location:loc_01');
  });

  it('returns station channel for kds bump', () => {
    const channels = getEventChannels(tenantId, 'fnb.kds.item_bumped.v1', {
      stationId: 'stn_01',
    });
    expect(channels).toContain('fnb:tenant_01:station:stn_01');
  });

  it('returns floor channel for table combined', () => {
    const channels = getEventChannels(tenantId, 'fnb.table.combined.v1', {
      roomId: 'room_01',
    });
    expect(channels).toContain('fnb:tenant_01:floor:room_01');
  });

  it('returns tab channel for lock acquired', () => {
    const channels = getEventChannels(tenantId, 'fnb.lock.acquired.v1', {
      tabId: 'tab_01',
    });
    expect(channels).toContain('fnb:tenant_01:tab:tab_01');
  });
});

describe('getDefaultSubscriptions', () => {
  it('returns location + terminal channels', () => {
    const subs = getDefaultSubscriptions('t1', 'loc_01', 'term_01');
    expect(subs).toEqual([
      'fnb:t1:location:loc_01',
      'fnb:t1:terminal:term_01',
    ]);
  });

  it('returns exactly 2 channels', () => {
    const subs = getDefaultSubscriptions('t1', 'loc_01', 'term_01');
    expect(subs).toHaveLength(2);
  });
});
