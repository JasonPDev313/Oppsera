'use client';

/**
 * Full-width color-coded aging header for KDS ticket cards.
 * Multi-row structured layout showing all key order metadata:
 *   Row 1: Terminal · Sent time
 *   Row 2: Ticket # (item count) · Customer name
 *   Row 3: Location · Table
 *   Row 4: Server · Elapsed timer
 *
 * Background changes color based on elapsed time so kitchen staff
 * can see aging state from across the room.
 */

import { formatTimer } from './TimerBar';

export type AgingTier = 'fresh' | 'normal' | 'warning' | 'critical';

const AGING_COLORS: Record<AgingTier, { bg: string; text: string; muted: string }> = {
  fresh:    { bg: '#16a34a', text: '#ffffff', muted: 'rgba(255,255,255,0.7)' },  // green-600
  normal:   { bg: '#ca8a04', text: '#ffffff', muted: 'rgba(255,255,255,0.7)' },  // yellow-600
  warning:  { bg: '#ea580c', text: '#ffffff', muted: 'rgba(255,255,255,0.75)' }, // orange-600
  critical: { bg: '#dc2626', text: '#ffffff', muted: 'rgba(255,255,255,0.8)' },  // red-600
};

export function getAgingTier(
  elapsedSeconds: number,
  warningThresholdSeconds: number,
  criticalThresholdSeconds: number,
): AgingTier {
  // Guard: negative elapsed (clock skew) or zero/negative thresholds
  const elapsed = Math.max(0, elapsedSeconds || 0);
  const warn = Math.max(1, warningThresholdSeconds || 480);
  const crit = Math.max(warn, criticalThresholdSeconds || 720);
  if (elapsed >= crit) return 'critical';
  if (elapsed >= warn) return 'warning';
  if (elapsed >= warn * 0.4) return 'normal';
  return 'fresh';
}

export function getAgingColors(tier: AgingTier) {
  return AGING_COLORS[tier];
}

function formatSentTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const h = d.getHours() % 12 || 12;
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `${h}:${m} ${ampm}`;
  } catch {
    return '';
  }
}

interface TicketHeaderProps {
  ticketNumber: number;
  tableNumber: number | null;
  courseNumber: number | null;
  courseName?: string | null;
  customerName?: string | null;
  orderType?: string | null;
  elapsedSeconds: number;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  density?: 'compact' | 'standard' | 'comfortable';
  /** Human-friendly terminal name (e.g., "Bar POS 1") */
  terminalName?: string | null;
  /** ISO datetime when the ticket was sent to KDS */
  sentAt?: string | null;
  /** Location name (e.g., "Pro Shop 1") */
  locationName?: string | null;
  /** Server / staff name */
  serverName?: string | null;
  /** Number of active items on this ticket */
  itemCount?: number;
}

export function TicketHeader({
  ticketNumber,
  tableNumber,
  courseNumber,
  courseName,
  customerName,
  orderType,
  elapsedSeconds,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  density = 'standard',
  terminalName,
  sentAt,
  locationName,
  serverName,
  itemCount,
}: TicketHeaderProps) {
  const tier = getAgingTier(elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds);
  const colors = AGING_COLORS[tier];
  const safeElapsed = Math.max(0, elapsedSeconds || 0);

  const isCompact = density === 'compact';
  const padding = isCompact ? 'px-2.5 py-1.5' : 'px-3 py-2';
  const rowGap = isCompact ? 'gap-0.5' : 'gap-1';
  const smallText = isCompact ? 'text-[9px]' : 'text-[10px]';
  const medText = isCompact ? 'text-xs' : 'text-sm';
  const timerSize = isCompact ? 'text-base' : density === 'comfortable' ? 'text-xl' : 'text-lg';

  const orderTypeLabel = orderType && orderType !== 'dine_in'
    ? orderType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  // Trim strings to avoid rendering whitespace-only values
  const trimmedTerminal = terminalName?.trim() || null;
  const trimmedCustomer = customerName?.trim() || null;
  const trimmedLocation = locationName?.trim() || null;
  const trimmedServer = serverName?.trim() || null;
  const sentTimeStr = sentAt ? formatSentTime(sentAt) : '';

  // Row visibility — only render rows that have data
  const hasRow1 = trimmedTerminal || sentTimeStr;
  const hasRow3 = trimmedLocation || tableNumber != null;
  const hasRow4 = trimmedServer;

  return (
    <div
      className={`${padding} flex flex-col ${rowGap} transition-colors duration-500`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        animation: tier === 'critical' ? 'kds-pulse 2s ease-in-out infinite' : undefined,
      }}
    >
      {/* Row 1: Terminal · Sent time */}
      {hasRow1 && (
        <div className="flex items-center justify-between" style={{ color: colors.muted }}>
          {trimmedTerminal ? (
            <span className={`${smallText} font-semibold truncate`}>
              {trimmedTerminal}
            </span>
          ) : <span />}
          {sentTimeStr && (
            <span className={`${smallText} font-semibold fnb-mono tabular-nums`}>
              {sentTimeStr}
            </span>
          )}
        </div>
      )}

      {/* Row 2: Ticket # (count) + badges · Customer name */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`${medText} font-bold fnb-mono`}>
            #{ticketNumber}
            {itemCount != null && itemCount > 0 && (
              <span style={{ opacity: 0.7 }}> ({itemCount})</span>
            )}
          </span>
          {courseNumber != null && (
            <span
              className="text-[9px] font-bold rounded px-1 py-0.5 truncate max-w-16"
              style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
              title={courseName ? `${courseName} (Course ${courseNumber})` : `Course ${courseNumber}`}
            >
              {courseName ?? `C${courseNumber}`}
            </span>
          )}
          {orderTypeLabel && (
            <span
              className="text-[9px] font-bold uppercase rounded px-1 py-0.5"
              style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
            >
              {orderTypeLabel}
            </span>
          )}
        </div>
        {trimmedCustomer && (
          <span className={`${smallText} font-bold truncate`} style={{ opacity: 0.9 }}>
            {trimmedCustomer}
          </span>
        )}
      </div>

      {/* Row 3: Location · Table */}
      {hasRow3 && (
        <div className="flex items-center justify-between" style={{ color: colors.muted }}>
          {trimmedLocation ? (
            <span className={`${smallText} font-medium truncate flex items-center gap-1`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0" style={{ opacity: 0.8 }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
              </svg>
              {trimmedLocation}
            </span>
          ) : <span />}
          {tableNumber != null && (
            <span className={`${smallText} font-bold`}>
              Table {tableNumber}
            </span>
          )}
        </div>
      )}

      {/* Row 4: Server · Timer */}
      <div className="flex items-center justify-between">
        {hasRow4 ? (
          <span className={`${smallText} font-medium truncate`} style={{ color: colors.muted }}>
            Server: {trimmedServer}
          </span>
        ) : <span />}
        <span className={`${timerSize} font-bold fnb-mono tabular-nums`}>
          {formatTimer(safeElapsed)}
        </span>
      </div>
    </div>
  );
}
