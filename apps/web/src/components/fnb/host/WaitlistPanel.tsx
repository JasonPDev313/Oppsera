'use client';

import { Plus, Star, Users, Clock, ArrowRight, Bell, X, UserPlus } from 'lucide-react';

interface WaitlistEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  quotedWaitMinutes: number | null;
  status: string;
  position: number;
  seatingPreference: string | null;
  isVip: boolean;
  elapsedMinutes: number;
  notes: string | null;
}

interface WaitlistPanelProps {
  entries: WaitlistEntry[];
  onSeat: (id: string) => void;
  onNotify: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

function getWaitColor(elapsed: number): string {
  if (elapsed >= 30) return 'var(--fnb-danger)';
  if (elapsed >= 15) return 'var(--fnb-warning)';
  return 'var(--fnb-success)';
}

function getWaitBg(elapsed: number): string {
  if (elapsed >= 30) return 'rgba(239, 68, 68, 0.1)';
  if (elapsed >= 15) return 'rgba(234, 179, 8, 0.1)';
  return 'rgba(34, 197, 94, 0.1)';
}

export function WaitlistPanel({
  entries,
  onSeat,
  onNotify,
  onRemove,
  onAdd,
}: WaitlistPanelProps) {
  const sorted = [...entries].sort((a, b) => a.position - b.position);

  return (
    <div
      className="flex flex-col h-full overflow-hidden rounded-xl"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: 'var(--fnb-border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: 'var(--fnb-border-subtle)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="text-sm font-bold"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            Waitlist
          </span>
          {entries.length > 0 && (
            <span
              className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--fnb-info)',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              {entries.length}
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all active:scale-95"
          style={{
            backgroundColor: 'var(--fnb-success)',
            color: '#fff',
            height: '36px',
          }}
        >
          <Plus size={14} />
          Add Guest
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="flex items-center justify-center h-14 w-14 rounded-full"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
            >
              <UserPlus size={24} style={{ color: 'var(--fnb-text-disabled)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
                No guests waiting
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--fnb-text-disabled)' }}>
                Tap &quot;Add Guest&quot; to start
              </p>
            </div>
          </div>
        ) : (
          sorted.map((entry, i) => (
            <WaitlistCard
              key={entry.id}
              entry={entry}
              rank={i + 1}
              onSeat={() => onSeat(entry.id)}
              onNotify={() => onNotify(entry.id)}
              onRemove={() => onRemove(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function WaitlistCard({
  entry,
  rank,
  onSeat,
  onNotify,
  onRemove,
}: {
  entry: WaitlistEntry;
  rank: number;
  onSeat: () => void;
  onNotify: () => void;
  onRemove: () => void;
}) {
  const isNotified = entry.status === 'notified';
  const waitColor = getWaitColor(entry.elapsedMinutes);
  const waitBg = getWaitBg(entry.elapsedMinutes);

  return (
    <div
      className="rounded-lg p-3 transition-colors"
      style={{
        backgroundColor: 'var(--fnb-bg-elevated)',
        borderLeft: isNotified
          ? '3px solid var(--fnb-info)'
          : '3px solid transparent',
      }}
    >
      {/* Top row: rank + name + badges */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold shrink-0 tabular-nums"
          style={{
            backgroundColor: 'var(--fnb-bg-surface)',
            color: 'var(--fnb-text-muted)',
            fontFamily: 'var(--fnb-font-mono)',
          }}
        >
          {rank}
        </span>
        <span
          className="text-sm font-semibold truncate flex-1"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          {entry.guestName}
        </span>
        {entry.isVip && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold shrink-0" style={{ color: '#f59e0b' }}>
            <Star size={10} fill="#f59e0b" />
            VIP
          </span>
        )}
        {isNotified && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: 'var(--fnb-info)',
            }}
          >
            Notified
          </span>
        )}
      </div>

      {/* Middle row: metadata chips */}
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--fnb-bg-surface)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          <Users size={11} />
          {entry.partySize}
        </span>

        <span
          className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded tabular-nums"
          style={{
            backgroundColor: waitBg,
            color: waitColor,
            fontFamily: 'var(--fnb-font-mono)',
          }}
        >
          <Clock size={11} />
          {entry.elapsedMinutes}m
        </span>

        {entry.seatingPreference && (
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.12)',
              color: '#a78bfa',
            }}
          >
            {entry.seatingPreference}
          </span>
        )}
      </div>

      {/* Notes */}
      {entry.notes && (
        <p
          className="text-[11px] truncate mb-2.5"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          {entry.notes}
        </p>
      )}

      {/* Actions — Seat is primary, others are secondary/icon */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSeat}
          className="flex items-center justify-center gap-1 rounded-md text-xs font-semibold flex-1 transition-all active:scale-[0.97]"
          style={{
            backgroundColor: 'var(--fnb-success)',
            color: '#fff',
            height: '34px',
          }}
        >
          <ArrowRight size={13} />
          Seat
        </button>
        <button
          onClick={onNotify}
          className="flex items-center justify-center gap-1 rounded-md text-xs font-medium flex-1 transition-all active:scale-[0.97]"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            color: 'var(--fnb-info)',
            height: '34px',
          }}
        >
          <Bell size={12} />
          Notify
        </button>
        <button
          onClick={onRemove}
          className="flex items-center justify-center rounded-md transition-all active:scale-[0.97] shrink-0"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--fnb-danger)',
            height: '34px',
            width: '34px',
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
