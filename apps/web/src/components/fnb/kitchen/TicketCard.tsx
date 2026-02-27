'use client';

import { useEffect, useRef } from 'react';
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
  /** DOM mode: show draft/unsent items as ghost preview */
  isDomTicket?: boolean;
  /** Estimated prep time in seconds for this ticket */
  estimatedPrepSeconds?: number | null;
  /** Enable audio alerts when timer crosses thresholds */
  audioAlerts?: boolean;
}

// Audio alert helper — plays a short beep tone
function playAlertTone(frequency: number, duration: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, duration);
  } catch { /* audio not available */ }
}

export function TicketCard({
  ticket,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  onBumpItem,
  onBumpTicket,
  disabled,
  isDomTicket,
  estimatedPrepSeconds,
  audioAlerts,
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
  const hasVoidedItems = ticket.items.some((i) => i.itemStatus === 'voided');

  // Audio alerts — fire once when crossing thresholds
  const prevPhaseRef = useRef<'normal' | 'warning' | 'critical'>('normal');
  useEffect(() => {
    if (!audioAlerts) return;
    const phase = ticket.elapsedSeconds >= criticalThresholdSeconds
      ? 'critical'
      : ticket.elapsedSeconds >= warningThresholdSeconds
      ? 'warning'
      : 'normal';
    if (phase !== prevPhaseRef.current) {
      if (phase === 'warning') playAlertTone(880, 200); // A5, short
      if (phase === 'critical') playAlertTone(1200, 400); // higher, longer
      prevPhaseRef.current = phase;
    }
  }, [ticket.elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds, audioAlerts]);

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden kds-ticket-card"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: isDomTicket
          ? '2px dashed var(--fnb-text-muted)'
          : isDelta
          ? '2px solid var(--fnb-status-dirty)'
          : hasVoidedItems
          ? '1px solid var(--fnb-danger, #ef4444)'
          : '1px solid rgba(148, 163, 184, 0.15)',
        opacity: isDomTicket ? 0.55 : 1,
      }}
    >
      {/* Timer bar — hidden for DOM previews */}
      {!isDomTicket && (
        <TimerBar
          elapsedSeconds={ticket.elapsedSeconds}
          warningThresholdSeconds={warningThresholdSeconds}
          criticalThresholdSeconds={criticalThresholdSeconds}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}
      >
        <div className="flex items-center gap-2">
          {isDomTicket && (
            <span className="text-[9px] font-bold uppercase rounded px-1 py-0.5"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-warning)' }}>
              INCOMING
            </span>
          )}
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
        <div className="flex items-center gap-2">
          {/* Prep time estimate */}
          {estimatedPrepSeconds != null && estimatedPrepSeconds > 0 && !isDomTicket && (
            <span className="text-[9px] font-medium rounded px-1 py-0.5"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}>
              ~{Math.ceil(estimatedPrepSeconds / 60)}m
            </span>
          )}
          {!isDomTicket && (
            <span className="text-base kds-text-timer font-bold fnb-mono" style={{ color: timerColor }}>
              {formatTimer(ticket.elapsedSeconds)}
            </span>
          )}
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

      {/* Also At — cross-station awareness */}
      {ticket.otherStations && ticket.otherStations.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          <span className="text-[9px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>Also at:</span>
          {ticket.otherStations.map((s) => (
            <span
              key={s.stationId}
              className="text-[9px] font-medium rounded-full px-1.5 py-0.5"
              style={{
                backgroundColor: 'var(--fnb-accent, rgba(99, 102, 241, 0.15))',
                color: 'var(--fnb-text-secondary)',
              }}
            >
              {s.stationName}
            </span>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {ticket.items.map((item) => (
          <TicketItemRow
            key={item.itemId}
            item={item}
            onBump={isDomTicket ? undefined : onBumpItem}
          />
        ))}
      </div>

      {/* Bump button — hidden for DOM previews */}
      {!isDomTicket && (
        <div className="p-2">
          <BumpButton
            onClick={() => onBumpTicket(ticket.ticketId)}
            disabled={disabled || !allReady}
            variant={allReady ? 'bump' : 'bump'}
            label={allReady ? 'BUMP' : `${ticket.items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'bumped').length}/${ticket.items.filter((i) => i.itemStatus !== 'voided').length} READY`}
          />
        </div>
      )}
    </div>
  );
}
