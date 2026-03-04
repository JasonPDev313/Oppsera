'use client';

/**
 * Compact single-line meta row showing server, order source, terminal, and time.
 * Sits below the TicketHeader in the redesigned TicketCard.
 */

interface TicketMetaRowProps {
  serverName: string | null;
  orderSource: string | null;
  terminalId: string | null;
  orderTimestamp: string | null;
  density?: 'compact' | 'standard' | 'comfortable';
}

const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  pos:      { label: 'POS',      color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  online:   { label: 'ONLINE',   color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)' },
  kiosk:    { label: 'KIOSK',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  delivery: { label: 'DELIVERY', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
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
  orderSource,
  terminalId,
  orderTimestamp,
  density = 'standard',
}: TicketMetaRowProps) {
  const textSize = density === 'compact' ? 'text-[9px]' : 'text-[10px]';
  const padding = density === 'compact' ? 'px-2 py-0.5' : 'px-3 py-1';
  const source = orderSource ? SOURCE_BADGES[orderSource] : null;

  const parts: string[] = [];
  if (serverName) parts.push(serverName);
  if (terminalId) parts.push(terminalId);
  if (orderTimestamp) parts.push(formatTime(orderTimestamp));

  if (parts.length === 0 && !source) return null;

  return (
    <div
      className={`flex items-center gap-1.5 ${padding}`}
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
      {parts.length > 0 && (
        <span className={`${textSize} truncate`} style={{ color: 'var(--fnb-text-muted)' }}>
          {parts.join(' · ')}
        </span>
      )}
    </div>
  );
}
