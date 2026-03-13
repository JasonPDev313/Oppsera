'use client';

import { useState, useEffect } from 'react';
import type { KdsTicketCard as KdsTicketCardType } from '@/types/fnb';
import { TicketHeader, getAgingTier } from './TicketHeader';
import { TicketMetaRow } from './TicketMetaRow';
import { AlertBadges } from './AlertBadges';
import { OrderProgressBar } from './OrderProgressBar';
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
  /** Display density */
  density?: 'compact' | 'standard' | 'comfortable';
  /** "All Day" counts: item name/label → total qty across all open tickets */
  allDayCounts?: Map<string, number>;
  /** KDS location ID for debug observability (renders as data-kds-location) */
  kdsLocationId?: string;
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
  density = 'standard',
  allDayCounts,
  kdsLocationId,
}: TicketCardProps) {
  const [confirmBump, setConfirmBump] = useState(false);

  useEffect(() => {
    if (!confirmBump) return;
    const timer = setTimeout(() => setConfirmBump(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmBump]);

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

  // Border glow based on aging tier (held tickets get amber border)
  const borderStyle = isDomTicket
    ? '2px dashed var(--fnb-text-muted)'
    : ticket.isHeld
    ? '2px dashed #f59e0b'
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

  const boxShadow = ticket.isHeld
    ? '0 0 8px rgba(245, 158, 11, 0.2)'
    : tier === 'critical'
    ? '0 0 12px rgba(239, 68, 68, 0.3)'
    : tier === 'warning'
    ? '0 0 8px rgba(234, 88, 12, 0.2)'
    : 'none';

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden kds-ticket-card shrink-0"
      data-kds-location={kdsLocationId}
      data-ticket-id={ticket.ticketId}
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: borderStyle,
        boxShadow,
        opacity: isDomTicket ? 0.55 : 1,
        width: cardWidth,
        minWidth: cardWidth,
      }}
    >
      {/* HELD banner — ticket is paused, do not prep */}
      {ticket.isHeld && !isDomTicket && (
        <div
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider animate-pulse"
          style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b' }}
        >
          HELD — Do Not Prep
        </div>
      )}

      {/* Stale ticket banner — from a previous business date */}
      {isStale && !isDomTicket && (
        <div
          className="flex items-center justify-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
        >
          Previous Day — {(() => {
            try {
              const d = new Date(ticket.businessDate + 'T00:00:00');
              return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            } catch { return ticket.businessDate; }
          })()}
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
          courseName={ticket.courseName}
          customerName={ticket.customerName}
          orderType={ticket.orderType}
          elapsedSeconds={ticket.elapsedSeconds}
          warningThresholdSeconds={warningThresholdSeconds}
          criticalThresholdSeconds={criticalThresholdSeconds}
          density={density}
        />
      )}

      {/* Meta row: server, customer, source, order type, terminal, time */}
      <TicketMetaRow
        serverName={ticket.serverName}
        customerName={ticket.customerName}
        orderSource={ticket.orderSource ?? null}
        orderType={ticket.orderType ?? null}
        terminalId={ticket.terminalId ?? null}
        terminalName={ticket.terminalName ?? null}
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

      {/* Cross-station order progress */}
      {!isDomTicket && ticket.totalOrderItems != null && ticket.stationItemCount != null && (
        <OrderProgressBar
          totalOrderItems={ticket.totalOrderItems}
          totalOrderReadyItems={ticket.totalOrderReadyItems ?? 0}
          stationItemCount={ticket.stationItemCount}
          stationReadyCount={ticket.stationReadyCount ?? 0}
        />
      )}

      {/* Estimated pickup time — critical for takeout/delivery */}
      {ticket.estimatedPickupAt && !isDomTicket && (
        <div
          className="flex items-center gap-1.5 px-3 py-1"
          style={{ backgroundColor: 'rgba(14, 165, 233, 0.08)' }}
        >
          <span className="text-[10px] font-bold" style={{ color: '#0ea5e9' }}>
            PICKUP
          </span>
          <span className="text-[10px] font-bold fnb-mono" style={{ color: '#0ea5e9' }}>
            {(() => {
              try {
                const d = new Date(ticket.estimatedPickupAt);
                const h = d.getHours() % 12 || 12;
                const m = d.getMinutes().toString().padStart(2, '0');
                const ampm = d.getHours() >= 12 ? 'p' : 'a';
                return `${h}:${m}${ampm}`;
              } catch { return ticket.estimatedPickupAt; }
            })()}
          </span>
        </div>
      )}

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
            allDayCount={allDayCounts?.get(item.kitchenLabel || item.itemName)}
          />
        ))}
      </div>

      {/* Bump button */}
      {!isDomTicket && (
        <div className={density === 'compact' ? 'p-2' : 'p-3'} aria-live="assertive">
          {confirmBump ? (
            <button
              type="button"
              aria-label="Confirm bump ticket"
              onClick={() => {
                onBumpTicket(ticket.ticketId);
                setConfirmBump(false);
              }}
              disabled={disabled}
              className="w-full rounded-lg text-sm font-bold uppercase tracking-wider transition-colors animate-pulse"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                minHeight: '64px',
              }}
            >
              TAP TO CONFIRM
            </button>
          ) : (
            <BumpButton
              onClick={() => {
                if (allReady) setConfirmBump(true);
              }}
              disabled={disabled || !allReady}
              variant="bump"
              label={allReady ? 'BUMP' : `${readyCount}/${activeCount} READY`}
            />
          )}
        </div>
      )}
    </div>
  );
}
