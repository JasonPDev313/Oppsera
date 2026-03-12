'use client';

/**
 * Full-width color-coded aging header for KDS ticket cards.
 * Replaces the thin TimerBar as the primary aging indicator.
 *
 * The ENTIRE header background changes color based on elapsed time,
 * so kitchen staff can see aging state from across the room.
 */

import { formatTimer } from './TimerBar';

export type AgingTier = 'fresh' | 'normal' | 'warning' | 'critical';

const AGING_COLORS: Record<AgingTier, { bg: string; text: string }> = {
  fresh:    { bg: '#16a34a', text: '#ffffff' },  // green-600
  normal:   { bg: '#ca8a04', text: '#ffffff' },  // yellow-600
  warning:  { bg: '#ea580c', text: '#ffffff' },  // orange-600
  critical: { bg: '#dc2626', text: '#ffffff' },  // red-600
};

export function getAgingTier(
  elapsedSeconds: number,
  warningThresholdSeconds: number,
  criticalThresholdSeconds: number,
): AgingTier {
  if (elapsedSeconds >= criticalThresholdSeconds) return 'critical';
  if (elapsedSeconds >= warningThresholdSeconds) return 'warning';
  if (elapsedSeconds >= warningThresholdSeconds * 0.4) return 'normal';
  return 'fresh';
}

export function getAgingColors(tier: AgingTier) {
  return AGING_COLORS[tier];
}

interface TicketHeaderProps {
  ticketNumber: number;
  tableNumber: number | null;
  courseNumber: number | null;
  /** Course name from definitions or tab courses */
  courseName?: string | null;
  /** Customer / guest name — critical for expo routing */
  customerName?: string | null;
  /** Order type (dine_in, takeout, delivery, etc.) */
  orderType?: string | null;
  elapsedSeconds: number;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  /** Density mode affects sizing */
  density?: 'compact' | 'standard' | 'comfortable';
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
}: TicketHeaderProps) {
  const tier = getAgingTier(elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds);
  const colors = AGING_COLORS[tier];

  const timerSize = density === 'compact' ? 'text-lg' : density === 'comfortable' ? 'text-2xl' : 'text-xl';
  const idSize = density === 'compact' ? 'text-xs' : 'text-sm';
  const padding = density === 'compact' ? 'px-2 py-1.5' : density === 'comfortable' ? 'px-4 py-3' : 'px-3 py-2';

  // Order-type label for non-dine-in orders (expo needs to know routing)
  const orderTypeLabel = orderType && orderType !== 'dine_in'
    ? orderType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div
      className={`${padding} transition-colors duration-500`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        animation: tier === 'critical' ? 'kds-pulse 2s ease-in-out infinite' : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`${idSize} font-bold fnb-mono`}>
            #{ticketNumber}
          </span>
          {tableNumber != null && (
            <>
              <span className={`${idSize} opacity-60`}>·</span>
              <span className={`${idSize} font-bold`}>
                T{tableNumber}
              </span>
            </>
          )}
          {courseNumber != null && (
            <span
              className="text-[10px] font-bold rounded px-1 py-0.5 truncate max-w-20"
              style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
              title={courseName ? `${courseName} (Course ${courseNumber})` : `Course ${courseNumber}`}
            >
              {courseName ?? `C${courseNumber}`}
            </span>
          )}
          {orderTypeLabel && (
            <span
              className="text-[10px] font-bold uppercase rounded px-1 py-0.5"
              style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
            >
              {orderTypeLabel}
            </span>
          )}
        </div>
        <span className={`${timerSize} font-bold fnb-mono tabular-nums`}>
          {formatTimer(elapsedSeconds)}
        </span>
      </div>
      {customerName && (
        <div className="truncate mt-0.5" style={{ opacity: 0.9 }}>
          <span className={`${idSize} font-bold`}>
            {customerName}
          </span>
        </div>
      )}
    </div>
  );
}
