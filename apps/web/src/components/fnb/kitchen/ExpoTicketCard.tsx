'use client';

import { useState, useEffect, useRef } from 'react';
import type { ExpoTicketCard as ExpoTicketCardType } from '@/types/fnb';
import { TicketHeader, getAgingTier } from './TicketHeader';
import { AlertBadges } from './AlertBadges';
import { BumpButton } from './BumpButton';
import { parseModifiers } from './TicketItemRow';
import { Flame, Undo2, Clock, AlertTriangle, Trash2 } from 'lucide-react';

/** Estimate seconds remaining based on max prep time of non-ready items minus elapsed */
function estimateRemainingSeconds(
  items: ExpoTicketCardType['items'],
  elapsedSeconds: number,
): number | null {
  const pendingItems = items.filter(
    (i) => i.itemStatus !== 'ready' && i.itemStatus !== 'served' && i.itemStatus !== 'voided',
  );
  if (pendingItems.length === 0) return null;
  const maxPrep = Math.max(...pendingItems.map((i) => i.estimatedPrepSeconds ?? 0));
  if (maxPrep === 0) return null; // no prep time data
  const remaining = maxPrep - elapsedSeconds;
  return remaining > 0 ? remaining : 0;
}

function formatEta(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `~${m}:${String(s).padStart(2, '0')}` : `~${s}s`;
}

/** Seconds a ready item can sit before being flagged stale */
const STALE_WARNING_SECONDS = 300; // 5 minutes
const STALE_CRITICAL_SECONDS = 600; // 10 minutes

type StaleLevel = 'none' | 'stale' | 'remake';

function computeStaleLevels(
  items: ExpoTicketCardType['items'],
): Map<string, StaleLevel> {
  const now = Date.now();
  const map = new Map<string, StaleLevel>();
  for (const item of items) {
    if (item.itemStatus !== 'ready' || !item.readyAt) {
      map.set(item.itemId, 'none');
      continue;
    }
    const readyTime = new Date(item.readyAt).getTime();
    if (Number.isNaN(readyTime)) {
      map.set(item.itemId, 'none');
      continue;
    }
    const secondsSinceReady = Math.floor((now - readyTime) / 1000);
    if (secondsSinceReady >= STALE_CRITICAL_SECONDS) map.set(item.itemId, 'remake');
    else if (secondsSinceReady >= STALE_WARNING_SECONDS) map.set(item.itemId, 'stale');
    else map.set(item.itemId, 'none');
  }
  return map;
}

/** Tickets older than 2 hours with no ready items are considered stale and show a void button */
const STALE_TICKET_SECONDS = 7200;

/** Two-tap void confirmation. First tap shows "CONFIRM VOID", second tap fires. Auto-resets after 3s. */
function VoidButton({ ticketId, onVoid, disabled }: { ticketId: string; onVoid: (id: string) => void; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleClick = () => {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirming(false);
      onVoid(ticketId);
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1 w-full rounded-md py-1.5 text-[10px] font-semibold uppercase transition-colors disabled:opacity-40"
      style={{
        backgroundColor: confirming ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.1)',
        color: '#ef4444',
        border: confirming ? '2px solid #ef4444' : '1px solid rgba(239,68,68,0.2)',
      }}
    >
      <Trash2 className="h-3 w-3" />
      {confirming ? 'CONFIRM VOID' : 'VOID TICKET'}
    </button>
  );
}

interface ExpoTicketCardProps {
  ticket: ExpoTicketCardType;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  onBumpTicket: (ticketId: string) => void;
  onFireTicket?: (ticketId: string) => void;
  onRecallTicket?: (ticketId: string) => void;
  onVoidTicket?: (ticketId: string) => void;
  disabled?: boolean;
  /** KDS location ID for debug observability (renders as data-kds-location) */
  kdsLocationId?: string;
}

export function ExpoTicketCard({
  ticket,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  onBumpTicket,
  onFireTicket,
  onRecallTicket,
  onVoidTicket,
  disabled,
  kdsLocationId,
}: ExpoTicketCardProps) {
  const tier = getAgingTier(ticket.elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds);

  // Group items by station
  const stationGroups: Record<string, typeof ticket.items> = {};
  for (const item of ticket.items) {
    const key = item.stationName ?? 'Unknown';
    if (!stationGroups[key]) stationGroups[key] = [];
    stationGroups[key].push(item);
  }

  const etaSeconds = estimateRemainingSeconds(ticket.items, ticket.elapsedSeconds);
  const staleLevels = computeStaleLevels(ticket.items);
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
      data-kds-location={kdsLocationId}
      data-ticket-id={ticket.ticketId}
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

      {/* Stale-in-window warning */}
      {(() => {
        const staleCount = ticket.items.filter(
          (i) => staleLevels.get(i.itemId) !== 'none',
        ).length;
        if (staleCount === 0) return null;
        const hasRemake = ticket.items.some((i) => staleLevels.get(i.itemId) === 'remake');
        return (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase"
            style={{
              backgroundColor: hasRemake ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.12)',
              color: hasRemake ? '#ef4444' : '#f59e0b',
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            {hasRemake
              ? `${staleCount} item${staleCount > 1 ? 's' : ''} — REMAKE?`
              : `${staleCount} item${staleCount > 1 ? 's' : ''} STALE in window`}
          </div>
        );
      })()}

      {/* Station readiness grid — enhanced with visual status */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
        {Object.entries(stationGroups).map(([stationName, items]) => {
          const ready = items.filter((i) => i.itemStatus === 'ready').length;
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
        {ticket.items.map((item) => {
          const { cookTemp, noMods, regularMods } = parseModifiers(item.modifierSummary ?? null);
          return (
            <div
              key={item.itemId}
              className="py-1 border-b last:border-b-0"
              style={{
                opacity: item.itemStatus === 'voided' ? 0.3 : 1,
                borderColor: 'rgba(148, 163, 184, 0.08)',
              }}
            >
              <div className="flex items-center gap-2">
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
                  className="text-xs font-semibold flex-1 truncate"
                  style={{
                    color: item.itemStatus === 'ready'
                      ? 'var(--fnb-status-available)'
                      : 'var(--fnb-text-primary)',
                  }}
                >
                  {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.kitchenLabel || item.itemName}
                </span>
                {item.isRush && (
                  <span className="text-[9px] font-bold" style={{ color: '#ef4444' }}>RUSH</span>
                )}
                <span className="text-[10px]" style={{
                  color: item.itemStatus === 'ready'
                    ? (staleLevels.get(item.itemId) === 'remake' ? '#ef4444'
                      : staleLevels.get(item.itemId) === 'stale' ? '#f59e0b'
                      : 'var(--fnb-status-available)')
                    : 'var(--fnb-text-muted)',
                }}>
                  {item.itemStatus === 'ready'
                    ? (staleLevels.get(item.itemId) === 'remake' ? '⚠ REMAKE?'
                      : staleLevels.get(item.itemId) === 'stale' ? '⚠ STALE'
                      : '✓')
                    : '⏳'}
                </span>
              </div>
              {/* Cook temp */}
              {cookTemp && (
                <p className="text-[10px] font-bold mt-0.5 ml-5" style={{ color: '#f97316' }}>
                  {cookTemp}
                </p>
              )}
              {/* "No" modifiers — red */}
              {noMods.length > 0 && (
                <p className="text-[10px] font-semibold mt-0.5 ml-5" style={{ color: '#ef4444' }}>
                  {noMods.join(', ')}
                </p>
              )}
              {/* Regular modifiers */}
              {regularMods && (
                <p className="text-[10px] mt-0.5 ml-5" style={{ color: 'var(--fnb-text-muted)' }}>
                  + {regularMods}
                </p>
              )}
              {/* Special instructions / notes */}
              {item.specialInstructions && (
                <p
                  className="text-[10px] italic mt-0.5 ml-5 rounded px-1 py-0.5"
                  style={{
                    color: 'var(--fnb-status-check-presented)',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  }}
                >
                  ** {item.specialInstructions}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Server + ETA */}
      {(ticket.serverName || etaSeconds != null) && (
        <div className="flex items-center justify-between px-3 py-1" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            {ticket.serverName ?? ''}
          </span>
          {etaSeconds != null && !ticket.allItemsReady && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold fnb-mono" style={{
              color: etaSeconds === 0 ? '#f97316' : 'var(--fnb-text-secondary)',
            }}>
              <Clock className="h-2.5 w-2.5" />
              {etaSeconds === 0 ? 'overdue' : formatEta(etaSeconds)}
            </span>
          )}
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
        {/* Void button — two-tap confirm to prevent accidental voids */}
        {!ticket.allItemsReady && ticket.elapsedSeconds >= STALE_TICKET_SECONDS && onVoidTicket && (
          <VoidButton ticketId={ticket.ticketId} onVoid={onVoidTicket} disabled={disabled} />
        )}
      </div>
    </div>
  );
}
