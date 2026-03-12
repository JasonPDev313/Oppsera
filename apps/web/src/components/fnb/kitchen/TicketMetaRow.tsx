'use client';

/**
 * Compact single-line meta row showing server, order source, terminal, and time.
 * Sits below the TicketHeader in the redesigned TicketCard.
 */

interface TicketMetaRowProps {
  serverName: string | null;
  customerName?: string | null;
  orderSource: string | null;
  orderType?: string | null;
  terminalId: string | null;
  /** Human-friendly terminal name (e.g., "Bar POS 1") — preferred over terminalId */
  terminalName?: string | null;
  orderTimestamp: string | null;
  density?: 'compact' | 'standard' | 'comfortable';
}

const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  pos:      { label: 'POS',      color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  online:   { label: 'ONLINE',   color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)' },
  kiosk:    { label: 'KIOSK',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  delivery: { label: 'DELIVERY', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
};

const ORDER_TYPE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  takeout:  { label: 'TAKEOUT',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  delivery: { label: 'DELIVERY', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  bar:      { label: 'BAR',      color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  drive_through: { label: 'DRIVE-THRU', color: '#ec4899', bg: 'rgba(236,72,153,0.15)' },
};

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'p' : 'a';
    const h12 = h % 12 || 12;
    return `${h12}:${m}${ampm}`;
  } catch {
    return '';
  }
}

export function TicketMetaRow({
  serverName,
  customerName,
  orderSource,
  orderType,
  terminalId,
  terminalName,
  orderTimestamp,
  density = 'standard',
}: TicketMetaRowProps) {
  const textSize = density === 'compact' ? 'text-[9px]' : 'text-[10px]';
  const padding = density === 'compact' ? 'px-2 py-0.5' : 'px-3 py-1';
  const source = orderSource ? SOURCE_BADGES[orderSource] : null;
  const orderTypeBadge = orderType ? ORDER_TYPE_BADGES[orderType] : null;

  // Prefer human-friendly terminal name over raw ULID
  const terminalLabel = terminalName || terminalId;

  const parts: string[] = [];
  if (serverName) parts.push(serverName);
  if (terminalLabel) parts.push(terminalLabel);
  if (orderTimestamp) parts.push(formatTime(orderTimestamp));

  if (parts.length === 0 && !source && !orderTypeBadge && !customerName) return null;

  return (
    <div
      className={`flex items-center gap-1.5 ${padding} flex-wrap`}
      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
    >
      {source && (
        <span
          className={`${textSize} font-bold rounded px-1 py-0.5`}
          style={{ color: source.color, backgroundColor: source.bg }}
        >
          {source.label}
        </span>
      )}
      {orderTypeBadge && (
        <span
          className={`${textSize} font-bold rounded px-1 py-0.5`}
          style={{ color: orderTypeBadge.color, backgroundColor: orderTypeBadge.bg }}
        >
          {orderTypeBadge.label}
        </span>
      )}
      {parts.length > 0 && (
        <span className={`${textSize} truncate`} style={{ color: 'var(--fnb-text-muted)' }}>
          {parts.join(' · ')}
        </span>
      )}
    </div>
  );
}
