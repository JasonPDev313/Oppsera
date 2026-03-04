'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Star, Users, Clock, ArrowRight, Bell, X, UserPlus,
  ChevronUp, ChevronDown, Pencil, AlertTriangle, Smartphone, QrCode as QrIcon,
  Merge, Split, Navigation, Search, Sparkles, Check,
} from 'lucide-react';
import type { WaitlistEntry } from '@/hooks/use-fnb-host';

// ── Props ────────────────────────────────────────────────────────

interface WaitlistPanelProps {
  entries: WaitlistEntry[];
  onSeat: (id: string) => void;
  onNotify: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onBumpUp?: (id: string) => void;
  onBumpDown?: (id: string) => void;
  onEdit?: (id: string) => void;
  onMerge?: (primaryId: string, secondaryId: string) => void;
  onSplit?: (id: string) => void;
  maxCapacity?: number;
  graceMinutes?: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function getWaitStyle(elapsed: number): { text: string; bg: string; border: string } {
  if (elapsed >= 30) return { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' };
  if (elapsed >= 15) return { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
  return { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'qr_code': return QrIcon;
    case 'phone':
    case 'sms': return Smartphone;
    default: return null;
  }
}

function getPriorityLabel(priority: number): string | null {
  if (priority >= 2) return 'Urgent';
  if (priority >= 1) return 'Priority';
  return null;
}

// ── Grace Countdown ─────────────────────────────────────────────

function GraceCountdown({ notifiedAt, graceMinutes }: { notifiedAt: string; graceMinutes: number }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => {
      const notif = new Date(notifiedAt).getTime();
      const expiry = notif + graceMinutes * 60_000;
      setRemaining(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [notifiedAt, graceMinutes]);

  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
        <AlertTriangle size={10} />
        Expired
      </span>
    );
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining < 120;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
      isUrgent ? 'bg-orange-500/15 text-orange-400' : 'bg-amber-500/15 text-amber-400'
    }`}>
      <Clock size={10} />
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

// ── Main Panel ──────────────────────────────────────────────────

export function WaitlistPanel({
  entries,
  onSeat,
  onNotify,
  onRemove,
  onAdd,
  onBumpUp,
  onBumpDown,
  onEdit,
  onMerge,
  onSplit,
  maxCapacity,
  graceMinutes = 10,
}: WaitlistPanelProps) {
  const sorted = [...entries].sort((a, b) => a.position - b.position);
  const atCapacity = maxCapacity != null && entries.length >= maxCapacity;
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string | null>(null);
  // 2A: search state
  const [searchQuery, setSearchQuery] = useState('');

  // 2A: filtered list (sorted first, then filtered)
  const filtered = sorted.filter(
    (e) => !searchQuery || e.guestName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-xl bg-card border border-border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold text-foreground">
            Waitlist
          </span>
          {entries.length > 0 && (
            <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
              atCapacity
                ? 'bg-red-500/10 text-red-400'
                : 'bg-indigo-500/10 text-indigo-400'
            }`}>
              {maxCapacity != null ? `${entries.length}/${maxCapacity}` : entries.length}
            </span>
          )}
          {atCapacity && (
            <span className="text-[10px] font-semibold text-red-400">Full</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onMerge && entries.length >= 2 && (
            <button
              onClick={() => { setMergeMode(!mergeMode); setMergeSelection(null); }}
              className={`flex items-center gap-1 rounded-lg px-2.5 h-9 text-xs font-semibold transition-all active:scale-95 border ${
                mergeMode
                  ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                  : 'bg-muted text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <Merge size={12} />
              {mergeMode ? 'Cancel' : 'Merge'}
            </button>
          )}
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-lg px-3.5 h-9 text-xs font-semibold transition-all active:scale-95 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
          >
            <Plus size={14} />
            Add Guest
          </button>
        </div>
      </div>

      {/* Merge mode banner */}
      {mergeMode && (
        <div className="mx-2.5 mt-2 rounded-lg px-3 py-2 bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400">
          {mergeSelection
            ? 'Now tap the second party to merge into the first.'
            : 'Tap the first party (will absorb the other).'}
        </div>
      )}

      {/* 2A: Search bar — only shown when 5+ entries */}
      {entries.length >= 5 && (
        <div className="px-2.5 pt-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-lg pl-8 pr-8 h-8 text-xs border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {searchQuery && filtered.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-2">
              No guests matching &ldquo;{searchQuery}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2" role="listbox" aria-label="Waitlist guests">
        {/* 2H: Enhanced empty state with contextual tip */}
        {filtered.length === 0 && !searchQuery ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted border border-border">
              <UserPlus size={24} className="text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">No guests waiting</p>
              <p className="text-[11px] mt-0.5 text-muted-foreground/60">Tap &quot;Add Guest&quot; for walk-ins or share the QR code</p>
            </div>
            <div className="mx-4 mt-1 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-center max-w-60">
              <p className="text-[11px] text-indigo-400 leading-relaxed">
                <Sparkles className="mr-1 inline-block h-3 w-3" />
                Tip: Print the QR code for your entrance so guests can self-add
              </p>
            </div>
          </div>
        ) : filtered.length === 0 && searchQuery ? (
          null
        ) : (
          filtered.map((entry, i) => (
            <WaitlistCard
              key={entry.id}
              entry={entry}
              rank={entry.position}
              isFirst={i === 0}
              isLast={i === filtered.length - 1}
              graceMinutes={graceMinutes}
              mergeMode={mergeMode}
              mergeSelected={mergeSelection === entry.id}
              onMergeSelect={() => {
                if (!mergeMode || !onMerge) return;
                if (!mergeSelection) {
                  setMergeSelection(entry.id);
                } else if (mergeSelection !== entry.id) {
                  onMerge(mergeSelection, entry.id);
                  setMergeMode(false);
                  setMergeSelection(null);
                }
              }}
              onSeat={() => onSeat(entry.id)}
              onNotify={() => onNotify(entry.id)}
              onRemove={() => onRemove(entry.id)}
              onBumpUp={onBumpUp ? () => onBumpUp(entry.id) : undefined}
              onBumpDown={onBumpDown ? () => onBumpDown(entry.id) : undefined}
              onEdit={onEdit ? () => onEdit(entry.id) : undefined}
              onSplit={onSplit && entry.partySize > 1 ? () => onSplit(entry.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────

function WaitlistCard({
  entry,
  rank,
  isFirst,
  isLast,
  graceMinutes,
  mergeMode,
  mergeSelected,
  onMergeSelect,
  onSeat,
  onNotify,
  onRemove,
  onBumpUp,
  onBumpDown,
  onEdit,
  onSplit,
}: {
  entry: WaitlistEntry;
  rank: number;
  isFirst: boolean;
  isLast: boolean;
  graceMinutes: number;
  mergeMode?: boolean;
  mergeSelected?: boolean;
  onMergeSelect?: () => void;
  onSeat: () => void;
  onNotify: () => void;
  onRemove: () => void;
  onBumpUp?: () => void;
  onBumpDown?: () => void;
  onEdit?: () => void;
  onSplit?: () => void;
}) {
  const isNotified = entry.status === 'notified';
  const waitStyle = getWaitStyle(entry.elapsedMinutes);
  const priorityLabel = getPriorityLabel(entry.priority);
  const SourceIcon = getSourceIcon(entry.source);
  const hasConfirmed = entry.confirmationStatus === 'on_my_way';

  // 2C: two-tap remove confirmation state
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // 2C: auto-reset confirmation after 3 seconds
  useEffect(() => {
    if (!confirmingRemove) return;
    const timer = setTimeout(() => setConfirmingRemove(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingRemove]);

  // 2G: grace expired — pulsing card border
  const graceExpired =
    isNotified &&
    entry.notifiedAt != null &&
    new Date(entry.notifiedAt).getTime() + graceMinutes * 60_000 < Date.now();

  return (
    <div
      role="option"
      aria-selected={mergeSelected}
      aria-label={`${entry.guestName}, party of ${entry.partySize}, waiting ${entry.elapsedMinutes} minutes`}
      tabIndex={0}
      onClick={mergeMode ? onMergeSelect : undefined}
      className={`rounded-xl p-3.5 transition-all duration-150 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none border ${
        mergeSelected
          ? 'bg-violet-500/10 border-violet-500/30 ring-2 ring-violet-500/40'
          : mergeMode
            ? 'bg-muted border-border cursor-pointer hover:border-violet-400/30'
            : graceExpired
              ? 'bg-red-500/5 border-red-500/30 animate-pulse'
              : isNotified
                ? 'bg-amber-500/5 border-amber-500/20'
                : 'bg-muted border-border hover:border-gray-400/30'
      }`}
    >
      {/* Top row: rank + bump arrows + name + badges */}
      <div className="flex items-center gap-2 mb-2">
        {/* Position + bump arrows */}
        <div className="flex flex-col items-center shrink-0">
          {onBumpUp && (
            <button
              type="button"
              onClick={onBumpUp}
              disabled={isFirst}
              aria-label="Move up in queue"
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default transition-colors -mb-0.5"
            >
              <ChevronUp size={12} />
            </button>
          )}
          <span className="flex items-center justify-center h-6 w-6 rounded-lg text-[10px] font-bold shrink-0 tabular-nums bg-gray-500/20 text-muted-foreground">
            {rank}
          </span>
          {onBumpDown && (
            <button
              type="button"
              onClick={onBumpDown}
              disabled={isLast}
              aria-label="Move down in queue"
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default transition-colors -mt-0.5"
            >
              <ChevronDown size={12} />
            </button>
          )}
        </div>

        {/* Name + badges */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-sm font-semibold truncate text-foreground">
            {entry.guestName}
          </span>
          {entry.isVip && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold shrink-0 text-amber-500">
              <Star size={10} fill="currentColor" />
              VIP
            </span>
          )}
          {priorityLabel && !entry.isVip && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-violet-500/15 text-violet-400">
              {priorityLabel}
            </span>
          )}
        </div>

        {/* Status badge */}
        {isNotified && entry.notifiedAt ? (
          <GraceCountdown notifiedAt={entry.notifiedAt} graceMinutes={graceMinutes} />
        ) : isNotified ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-amber-500/15 text-amber-400">
            Notified
          </span>
        ) : null}

        {/* On My Way badge */}
        {hasConfirmed && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/15 text-emerald-400">
            <Navigation size={9} />
            OMW
          </span>
        )}

        {/* Edit button */}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${entry.guestName}`}
            className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {/* 2D: VIP note display */}
      {entry.isVip && entry.vipNote && (
        <p className="text-[10px] text-amber-500/70 italic truncate pl-8 -mt-0.5 mb-1">{entry.vipNote}</p>
      )}

      {/* Middle row: metadata chips */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-500/10 text-muted-foreground">
          <Users size={11} />
          {entry.partySize}
        </span>

        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums ${waitStyle.bg} ${waitStyle.text}`}>
          <Clock size={11} />
          {entry.elapsedMinutes}m
        </span>

        {entry.seatingPreference && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400">
            {entry.seatingPreference}
          </span>
        )}

        {SourceIcon && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-500/8 text-muted-foreground/60">
            <SourceIcon size={10} />
          </span>
        )}

        {/* 2I: No-phone SMS warning badge */}
        {!entry.guestPhone && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/8 text-amber-500/60"
            title="No phone number — cannot send SMS"
          >
            <Smartphone size={10} />
            <span className="line-through">SMS</span>
          </span>
        )}

        {entry.quotedWaitMinutes != null && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-500/8 text-muted-foreground/60">
            Quoted {entry.quotedWaitMinutes}m
          </span>
        )}
      </div>

      {/* Notes + special requests */}
      {(entry.notes || entry.specialRequests) && (
        <p className="text-[11px] truncate mb-3 text-muted-foreground italic">
          {entry.specialRequests || entry.notes}
        </p>
      )}

      {/* Actions */}
      {!mergeMode && (
        <div className="flex items-center gap-1.5">
          {/* 2E: OMW pulsing Seat button */}
          <button
            onClick={onSeat}
            className={`flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold flex-1 h-9 transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm ${hasConfirmed ? 'animate-pulse ring-2 ring-emerald-400/50' : ''}`}
          >
            <ArrowRight size={13} />
            {hasConfirmed ? 'Seat Now' : 'Seat'}
          </button>

          {/* 2B: Re-Notify button for notified guests */}
          {isNotified ? (
            <button
              onClick={onNotify}
              className="flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium flex-1 h-9 transition-all active:scale-[0.97] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20"
            >
              <Bell size={12} />
              Re-Notify
            </button>
          ) : (
            <button
              onClick={onNotify}
              className="flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium flex-1 h-9 transition-all active:scale-[0.97] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20"
            >
              <Bell size={12} />
              Notify
            </button>
          )}

          {onSplit && (
            <button
              onClick={onSplit}
              aria-label={`Split ${entry.guestName} party`}
              className="flex items-center justify-center rounded-lg h-9 w-9 shrink-0 transition-all active:scale-[0.97] bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20"
            >
              <Split size={14} />
            </button>
          )}

          {/* 2C: Two-tap remove confirmation */}
          <button
            onClick={() => {
              if (confirmingRemove) {
                onRemove();
                setConfirmingRemove(false);
              } else {
                setConfirmingRemove(true);
              }
            }}
            aria-label={confirmingRemove ? `Confirm remove ${entry.guestName}` : `Remove ${entry.guestName} from waitlist`}
            className={`flex items-center justify-center rounded-lg h-9 shrink-0 transition-all active:scale-[0.97] ${
              confirmingRemove
                ? 'bg-red-500 text-white w-18 gap-1 text-[10px] font-bold'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 w-9'
            }`}
          >
            {confirmingRemove ? (<><Check size={12} />Sure?</>) : (<X size={14} />)}
          </button>
        </div>
      )}
    </div>
  );
}
