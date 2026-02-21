'use client';

import type { ExpoTicketCard as ExpoTicketCardType } from '@/types/fnb';
import { TimerBar, formatTimer, getTimerColorForElapsed } from './TimerBar';
import { BumpButton } from './BumpButton';

interface ExpoTicketCardProps {
  ticket: ExpoTicketCardType;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  onBumpTicket: (ticketId: string) => void;
  disabled?: boolean;
}

export function ExpoTicketCard({
  ticket,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  onBumpTicket,
  disabled,
}: ExpoTicketCardProps) {
  const timerColor = getTimerColorForElapsed(
    ticket.elapsedSeconds,
    warningThresholdSeconds,
    criticalThresholdSeconds,
  );

  // Group items by station
  const stationGroups: Record<string, typeof ticket.items> = {};
  for (const item of ticket.items) {
    const key = item.stationName ?? 'Unknown';
    if (!stationGroups[key]) stationGroups[key] = [];
    stationGroups[key].push(item);
  }

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: ticket.allItemsReady
          ? '2px solid var(--fnb-status-available)'
          : '1px solid rgba(148, 163, 184, 0.15)',
        minWidth: '240px',
        maxWidth: '300px',
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
          <span className="text-sm font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>
            #{ticket.ticketNumber}
          </span>
          {ticket.tableNumber && (
            <span className="text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>
              T{ticket.tableNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>
            {ticket.readyCount}/{ticket.totalCount}
          </span>
          <span className="text-base font-bold fnb-mono" style={{ color: timerColor }}>
            {formatTimer(ticket.elapsedSeconds)}
          </span>
        </div>
      </div>

      {/* Station readiness */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {Object.entries(stationGroups).map(([stationName, items]) => {
          const ready = items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'bumped').length;
          const total = items.filter((i) => i.itemStatus !== 'voided').length;
          const allDone = ready === total;

          return (
            <div key={stationName} className="flex items-center justify-between py-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                {stationName}
              </span>
              <div className="flex items-center gap-1.5">
                {items.map((item) => (
                  <span
                    key={item.itemId}
                    className="text-[10px]"
                    style={{
                      color: item.itemStatus === 'ready' || item.itemStatus === 'bumped'
                        ? 'var(--fnb-status-available)'
                        : item.itemStatus === 'voided'
                          ? 'var(--fnb-text-muted)'
                          : 'var(--fnb-text-secondary)',
                    }}
                  >
                    {item.itemStatus === 'ready' || item.itemStatus === 'bumped' ? '✓' : '⏳'}
                  </span>
                ))}
                <span
                  className="text-[10px] font-bold"
                  style={{ color: allDone ? 'var(--fnb-status-available)' : 'var(--fnb-text-muted)' }}
                >
                  {ready}/{total}
                </span>
              </div>
            </div>
          );
        })}

        {/* Item details (collapsed) */}
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
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
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--fnb-text-secondary)' }}>
                {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.itemName}
              </span>
              {item.isRush && (
                <span className="text-[9px] font-bold" style={{ color: 'var(--fnb-status-dirty)' }}>RUSH</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Server */}
      {ticket.serverName && (
        <div className="px-3 py-1" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            {ticket.serverName}
          </span>
        </div>
      )}

      {/* Bump button */}
      <div className="p-2">
        <BumpButton
          onClick={() => onBumpTicket(ticket.ticketId)}
          disabled={disabled || !ticket.allItemsReady}
          variant="served"
          label={ticket.allItemsReady ? 'SERVE' : `${ticket.readyCount}/${ticket.totalCount} READY`}
        />
      </div>
    </div>
  );
}
