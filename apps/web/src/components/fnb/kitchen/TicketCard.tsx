'use client';

import { useEffect, useRef } from 'react';
import type { KdsTicketCard as KdsTicketCardType } from '@/types/fnb';
import { TicketHeader, getAgingTier } from './TicketHeader';
import { TicketMetaRow } from './TicketMetaRow';
import { AlertBadges } from './AlertBadges';
import { TicketItemRow } from './TicketItemRow';
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
  /** Display density */
  density?: 'compact' | 'standard' | 'comfortable';
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
  density = 'standard',
}: TicketCardProps) {
  const tier = getAgingTier(ticket.elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds);

  const allReady = ticket.items.every(
    (i) => i.itemStatus === 'ready' || i.itemStatus === 'voided',
  );
  const isDelta = ticket.status === 'pending' && ticket.items.length === 1;
  const hasVoidedItems = ticket.items.some((i) => i.itemStatus === 'voided');
  // Detect stale tickets from a previous business date
  const isStale = !!ticket.businessDate && ticket.businessDate < new Date().toISOString().slice(0, 10);
  const hasRush = ticket.items.some((i) => i.isRush);
  const hasAllergy = ticket.items.some((i) => i.isAllergy);
  const hasVip = ticket.items.some((i) => i.isVip);
  const readyCount = ticket.items.filter((i) => i.itemStatus === 'ready').length;
  const activeCount = ticket.items.filter((i) => i.itemStatus !== 'voided').length;

  // Card width based on density — generous for touch targets
  const cardWidth = density === 'compact' ? '240px' : density === 'comfortable' ? '360px' : '300px';

  // Border glow based on aging tier
  const borderStyle = isDomTicket
    ? '2px dashed var(--fnb-text-muted)'
    : isDelta
    ? '2px solid var(--fnb-status-dirty)'
    : hasVoidedItems
    ? '1px solid var(--fnb-danger, #ef4444)'
    : tier === 'critical'
    ? '2px solid #ef4444'
    : tier === 'warning'
    ? '2px solid #ea580c'
    : tier === 'normal'
    ? '1px solid #ca8a04'
    : '1px solid rgba(148, 163, 184, 0.15)';

  const boxShadow = tier === 'critical'
    ? '0 0 12px rgba(239, 68, 68, 0.3)'
    : tier === 'warning'
    ? '0 0 8px rgba(234, 88, 12, 0.2)'
    : 'none';

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
      if (phase === 'warning') playAlertTone(880, 200);
      if (phase === 'critical') playAlertTone(1200, 400);
      prevPhaseRef.current = phase;
    }
  }, [ticket.elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds, audioAlerts]);

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden kds-ticket-card shrink-0"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: borderStyle,
        boxShadow,
        opacity: isDomTicket ? 0.55 : 1,
        width: cardWidth,
        minWidth: cardWidth,
      }}
    >
      {/* Stale ticket banner — from a previous business date */}
      {isStale && !isDomTicket && (
        <div
          className="flex items-center justify-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
        >
          Previous Day — {ticket.businessDate}
        </div>
      )}

      {/* Color-coded aging header */}
      {isDomTicket ? (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <span className="text-[9px] font-bold uppercase rounded px-1 py-0.5"
            style={{ backgroundColor: 'var(--fnb-bg-surface)', color: 'var(--fnb-warning)' }}>
            INCOMING
          </span>
          <span className="text-sm font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>
            #{ticket.ticketNumber}
          </span>
        </div>
      ) : (
        <TicketHeader
          ticketNumber={ticket.ticketNumber}
          tableNumber={ticket.tableNumber}
          courseNumber={ticket.courseNumber}
          elapsedSeconds={ticket.elapsedSeconds}
          warningThresholdSeconds={warningThresholdSeconds}
          criticalThresholdSeconds={criticalThresholdSeconds}
          density={density}
        />
      )}

      {/* Meta row: server, source, terminal, time */}
      <TicketMetaRow
        serverName={ticket.serverName}
        orderSource={ticket.orderSource ?? null}
        terminalId={ticket.terminalId ?? null}
        orderTimestamp={ticket.orderTimestamp ?? null}
        density={density}
      />

      {/* Alert badges */}
      <AlertBadges
        isRush={hasRush}
        isAllergy={hasAllergy}
        isVip={hasVip}
        itemCount={ticket.items.length}
        density={density}
      />

      {/* Cross-station awareness */}
      {ticket.otherStations && ticket.otherStations.length > 0 && (
        <div
          className="flex items-center gap-1 px-3 py-1 border-b"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', borderColor: 'rgba(148, 163, 184, 0.1)' }}
        >
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

      {/* Prep time estimate */}
      {estimatedPrepSeconds != null && estimatedPrepSeconds > 0 && !isDomTicket && (
        <div className="px-3 py-0.5 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <span className="text-[9px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
            ETA: ~{Math.ceil(estimatedPrepSeconds / 60)}m
          </span>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {ticket.items.map((item) => (
          <TicketItemRow
            key={item.itemId}
            item={item}
            onBump={isDomTicket ? undefined : onBumpItem}
            density={density}
          />
        ))}
      </div>

      {/* Bump button */}
      {!isDomTicket && (
        <div className={density === 'compact' ? 'p-2' : 'p-3'}>
          <BumpButton
            onClick={() => onBumpTicket(ticket.ticketId)}
            disabled={disabled || !allReady}
            variant="bump"
            label={allReady ? 'BUMP' : `${readyCount}/${activeCount} READY`}
          />
        </div>
      )}
    </div>
  );
}
