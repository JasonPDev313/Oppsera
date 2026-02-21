'use client';

import type { KdsTicketCard as KdsTicketCardType } from '@/types/fnb';
import { TicketItemRow } from './TicketItemRow';
import { TimerBar, formatTimer, getTimerColorForElapsed } from './TimerBar';
import { BumpButton } from './BumpButton';

interface TicketCardProps {
  ticket: KdsTicketCardType;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  onBumpItem: (ticketItemId: string) => void;
  onBumpTicket: (ticketId: string) => void;
  disabled?: boolean;
}

export function TicketCard({
  ticket,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  onBumpItem,
  onBumpTicket,
  disabled,
}: TicketCardProps) {
  const timerColor = getTimerColorForElapsed(
    ticket.elapsedSeconds,
    warningThresholdSeconds,
    criticalThresholdSeconds,
  );
  const allReady = ticket.items.every(
    (i) => i.itemStatus === 'ready' || i.itemStatus === 'bumped' || i.itemStatus === 'voided',
  );
  const isDelta = ticket.status === 'pending' && ticket.items.length === 1;

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden kds-ticket-card"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: isDelta
          ? '2px solid var(--fnb-status-dirty)'
          : '1px solid rgba(148, 163, 184, 0.15)',
      }}
    >
      {/* Timer bar */}
      <TimerBar
        elapsedSeconds={ticket.elapsedSeconds}
        warningThresholdSeconds={warningThresholdSeconds}
        criticalThresholdSeconds={criticalThresholdSeconds}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm kds-text-ticket font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>
            #{ticket.ticketNumber}
          </span>
          {ticket.tableNumber && (
            <span className="text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>
              T{ticket.tableNumber}
            </span>
          )}
          {ticket.courseNumber && (
            <span className="text-[10px] font-bold rounded px-1 py-0.5"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}>
              C{ticket.courseNumber}
            </span>
          )}
        </div>
        <span className="text-base kds-text-timer font-bold fnb-mono" style={{ color: timerColor }}>
          {formatTimer(ticket.elapsedSeconds)}
        </span>
      </div>

      {/* Server */}
      {ticket.serverName && (
        <div className="px-3 py-1" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            {ticket.serverName}
          </span>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {ticket.items.map((item) => (
          <TicketItemRow
            key={item.itemId}
            item={item}
            onBump={onBumpItem}
          />
        ))}
      </div>

      {/* Bump button */}
      <div className="p-2">
        <BumpButton
          onClick={() => onBumpTicket(ticket.ticketId)}
          disabled={disabled || !allReady}
          variant={allReady ? 'bump' : 'bump'}
          label={allReady ? 'BUMP' : `${ticket.items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'bumped').length}/${ticket.items.filter((i) => i.itemStatus !== 'voided').length} READY`}
        />
      </div>
    </div>
  );
}
