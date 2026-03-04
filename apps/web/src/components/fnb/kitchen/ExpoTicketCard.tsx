'use client';

import type { ExpoTicketCard as ExpoTicketCardType } from '@/types/fnb';
import { TicketHeader, getAgingTier } from './TicketHeader';
import { AlertBadges } from './AlertBadges';
import { BumpButton } from './BumpButton';
import { Flame, Undo2 } from 'lucide-react';

interface ExpoTicketCardProps {
  ticket: ExpoTicketCardType;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  onBumpTicket: (ticketId: string) => void;
  onFireTicket?: (ticketId: string) => void;
  onRecallTicket?: (ticketId: string) => void;
  disabled?: boolean;
}

export function ExpoTicketCard({
  ticket,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  onBumpTicket,
  onFireTicket,
  onRecallTicket,
  disabled,
}: ExpoTicketCardProps) {
  const tier = getAgingTier(ticket.elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds);

  // Group items by station
  const stationGroups: Record<string, typeof ticket.items> = {};
  for (const item of ticket.items) {
    const key = item.stationName ?? 'Unknown';
    if (!stationGroups[key]) stationGroups[key] = [];
    stationGroups[key].push(item);
  }

  const hasRush = ticket.items.some((i) => i.isRush);
  const hasAllergy = ticket.items.some((i) => i.isAllergy);
  const hasVip = ticket.items.some((i) => i.isVip);

  const borderStyle = ticket.allItemsReady
    ? '2px solid var(--fnb-status-available)'
    : tier === 'critical'
    ? '2px solid #ef4444'
    : tier === 'warning'
    ? '2px solid #ea580c'
    : '1px solid rgba(148, 163, 184, 0.15)';

  const boxShadow = ticket.allItemsReady
    ? '0 0 12px rgba(34, 197, 94, 0.25)'
    : tier === 'critical'
    ? '0 0 12px rgba(239, 68, 68, 0.3)'
    : 'none';

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: borderStyle,
        boxShadow,
        minWidth: '240px',
        maxWidth: '300px',
      }}
    >
      {/* Color-coded aging header */}
      <TicketHeader
        ticketNumber={ticket.ticketNumber}
        tableNumber={ticket.tableNumber}
        courseNumber={ticket.courseNumber}
        elapsedSeconds={ticket.elapsedSeconds}
        warningThresholdSeconds={warningThresholdSeconds}
        criticalThresholdSeconds={criticalThresholdSeconds}
        density="standard"
      />

      {/* Alert badges */}
      <AlertBadges
        isRush={hasRush}
        isAllergy={hasAllergy}
        isVip={hasVip}
        itemCount={ticket.items.length}
      />

      {/* Station readiness grid — enhanced with visual status */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
        {Object.entries(stationGroups).map(([stationName, items]) => {
          const ready = items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'bumped').length;
          const total = items.filter((i) => i.itemStatus !== 'voided').length;
          const allDone = ready === total;
          const pct = total > 0 ? (ready / total) * 100 : 0;

          return (
            <div key={stationName} className="flex items-center gap-2 py-1">
              {/* Station name */}
              <span className="text-xs font-semibold flex-1 truncate" style={{ color: 'var(--fnb-text-primary)' }}>
                {stationName}
              </span>
              {/* Progress bar */}
              <div
                className="w-16 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgba(148, 163, 184, 0.1)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: allDone ? '#22c55e' : '#6366f1',
                  }}
                />
              </div>
              {/* Count */}
              <span
                className="text-[10px] font-bold fnb-mono"
                style={{ color: allDone ? 'var(--fnb-status-available)' : 'var(--fnb-text-muted)' }}
              >
                {allDone ? '✓' : `${ready}/${total}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Item details */}
      <div className="flex-1 overflow-y-auto px-3 py-1.5">
        {ticket.items.map((item) => (
          <div
            key={item.itemId}
            className="flex items-center gap-2 py-0.5"
            style={{ opacity: item.itemStatus === 'voided' ? 0.3 : 1 }}
          >
            {item.seatNumber && (
              <span
                className="shrink-0 flex items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: 'var(--fnb-status-ordered)',
                  color: '#fff',
                }}
              >
                {item.seatNumber}
              </span>
            )}
            <span
              className="text-xs flex-1 truncate"
              style={{
                color: item.itemStatus === 'ready' || item.itemStatus === 'bumped'
                  ? 'var(--fnb-status-available)'
                  : 'var(--fnb-text-secondary)',
              }}
            >
              {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.itemName}
            </span>
            {item.isRush && (
              <span className="text-[9px] font-bold" style={{ color: '#ef4444' }}>RUSH</span>
            )}
            <span className="text-[10px]" style={{
              color: item.itemStatus === 'ready' || item.itemStatus === 'bumped'
                ? 'var(--fnb-status-available)'
                : 'var(--fnb-text-muted)',
            }}>
              {item.itemStatus === 'ready' || item.itemStatus === 'bumped' ? '✓' : '⏳'}
            </span>
          </div>
        ))}
      </div>

      {/* Server */}
      {ticket.serverName && (
        <div className="px-3 py-1" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            {ticket.serverName}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-2 flex flex-col gap-1.5">
        {ticket.status === 'pending' && onFireTicket ? (
          <button
            type="button"
            onClick={() => onFireTicket(ticket.ticketId)}
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 w-full rounded-md py-2 text-xs font-bold uppercase transition-colors disabled:opacity-40"
            style={{
              backgroundColor: 'rgba(249,115,22,0.2)',
              color: '#f97316',
              border: '1px solid rgba(249,115,22,0.3)',
            }}
          >
            <Flame className="h-3.5 w-3.5" />
            FIRE
          </button>
        ) : (
          <>
            <BumpButton
              onClick={() => onBumpTicket(ticket.ticketId)}
              disabled={disabled || !ticket.allItemsReady}
              variant="served"
              label={ticket.allItemsReady ? 'SERVE' : `${ticket.readyCount}/${ticket.totalCount} READY`}
            />
            {ticket.allItemsReady && onRecallTicket && (
              <button
                type="button"
                onClick={() => onRecallTicket(ticket.ticketId)}
                disabled={disabled}
                className="flex items-center justify-center gap-1 w-full rounded-md py-1.5 text-[10px] font-semibold uppercase transition-colors disabled:opacity-40"
                style={{
                  backgroundColor: 'rgba(148,163,184,0.1)',
                  color: 'var(--fnb-text-muted)',
                  border: '1px solid rgba(148,163,184,0.15)',
                }}
              >
                <Undo2 className="h-3 w-3" />
                RECALL
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
