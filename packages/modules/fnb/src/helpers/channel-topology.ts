/**
 * Channel topology for F&B real-time event distribution.
 * Pure functions — no side effects, no DB calls.
 */

export type ChannelScope = 'location' | 'terminal' | 'station' | 'floor' | 'tab';

/** Build a channel name from its components */
export function buildChannelName(
  tenantId: string,
  scope: ChannelScope,
  scopeId: string,
): string {
  return `fnb:${tenantId}:${scope}:${scopeId}`;
}

/** Parse a channel name into its components */
export function parseChannelName(channel: string): {
  tenantId: string;
  scope: ChannelScope;
  scopeId: string;
} | null {
  const parts = channel.split(':');
  if (parts.length !== 4 || parts[0] !== 'fnb') return null;
  return {
    tenantId: parts[1]!,
    scope: parts[2] as ChannelScope,
    scopeId: parts[3]!,
  };
}

/**
 * Determines which channels an event should be broadcast to.
 * Returns an array of channel names (without tenantId prefix — caller adds it).
 */
export function getEventChannels(
  tenantId: string,
  eventType: string,
  context: {
    locationId?: string;
    terminalId?: string;
    stationId?: string;
    roomId?: string;
    tabId?: string;
  },
): string[] {
  const channels: string[] = [];
  const { locationId, terminalId, stationId, roomId, tabId } = context;

  // Location-scoped events (broadcast to all terminals at location)
  const locationEvents = [
    'fnb.table.status_changed.v1',
    'fnb.tab.opened.v1',
    'fnb.tab.closed.v1',
    'fnb.tab.voided.v1',
    'fnb.tab.transferred.v1',
    'fnb.close_batch.started.v1',
    'fnb.close_batch.reconciled.v1',
    'fnb.close_batch.posted.v1',
    'fnb.menu.item_eighty_sixed.v1',
    'fnb.menu.item_restored.v1',
    'fnb.payment.completed.v1',
    'fnb.settings.updated.v1',
  ];

  if (locationId && locationEvents.includes(eventType)) {
    channels.push(buildChannelName(tenantId, 'location', locationId));
  }

  // Floor-scoped events (host stand / floor plan)
  const floorEvents = [
    'fnb.table.status_changed.v1',
    'fnb.table.synced_from_floor_plan.v1',
    'fnb.table.combined.v1',
    'fnb.table.uncombined.v1',
  ];

  if (roomId && floorEvents.includes(eventType)) {
    channels.push(buildChannelName(tenantId, 'floor', roomId));
  }

  // Station-scoped events (KDS)
  const stationEvents = [
    'fnb.ticket.created.v1',
    'fnb.ticket.status_changed.v1',
    'fnb.ticket_item.status_changed.v1',
    'fnb.ticket.voided.v1',
    'fnb.delta_chit.created.v1',
    'fnb.kds.item_bumped.v1',
    'fnb.kds.item_recalled.v1',
    'fnb.kds.ticket_bumped.v1',
    'fnb.kds.item_called_back.v1',
  ];

  if (stationId && stationEvents.includes(eventType)) {
    channels.push(buildChannelName(tenantId, 'station', stationId));
  }

  // Tab-scoped events (editing terminal)
  const tabEvents = [
    'fnb.tab.updated.v1',
    'fnb.course.sent.v1',
    'fnb.course.fired.v1',
    'fnb.payment.started.v1',
    'fnb.payment.completed.v1',
    'fnb.payment.failed.v1',
    'fnb.lock.acquired.v1',
    'fnb.lock.released.v1',
  ];

  if (tabId && tabEvents.includes(eventType)) {
    channels.push(buildChannelName(tenantId, 'tab', tabId));
  }

  // Terminal-scoped events (single terminal)
  const terminalEvents = [
    'fnb.terminal.connected.v1',
    'fnb.terminal.disconnected.v1',
  ];

  if (terminalId && terminalEvents.includes(eventType)) {
    channels.push(buildChannelName(tenantId, 'terminal', terminalId));
  }

  return channels;
}

/** List the default channels a terminal should subscribe to on connect */
export function getDefaultSubscriptions(
  tenantId: string,
  locationId: string,
  terminalId: string,
): string[] {
  return [
    buildChannelName(tenantId, 'location', locationId),
    buildChannelName(tenantId, 'terminal', terminalId),
  ];
}
