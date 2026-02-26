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

function getWaitStyle(elapsed: number): { text: string; bg: string; border: string } {
  if (elapsed >= 30) return { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' };
  if (elapsed >= 15) return { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
  return { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
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
    <div className="flex flex-col h-full overflow-hidden rounded-xl bg-card border border-border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold text-foreground">
            Waitlist
          </span>
          {entries.length > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums bg-indigo-500/10 text-indigo-400">
              {entries.length}
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg px-3.5 h-9 text-xs font-semibold transition-all active:scale-95 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
        >
          <Plus size={14} />
          Add Guest
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2" role="listbox" aria-label="Waitlist guests">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted border border-border">
              <UserPlus size={24} className="text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No guests waiting
              </p>
              <p className="text-[11px] mt-0.5 text-muted-foreground/60">
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
  const waitStyle = getWaitStyle(entry.elapsedMinutes);

  return (
    <div
      role="option"
      aria-selected={false}
      aria-label={`${entry.guestName}, party of ${entry.partySize}, waiting ${entry.elapsedMinutes} minutes`}
      tabIndex={0}
      className={`rounded-xl p-3.5 transition-all duration-150 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none border ${
        isNotified
          ? 'bg-blue-500/5 border-blue-500/20'
          : 'bg-muted border-border hover:border-gray-400/30'
      }`}
    >
      {/* Top row: rank + name + badges */}
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center h-6 w-6 rounded-lg text-[10px] font-bold shrink-0 tabular-nums bg-gray-500/20 text-muted-foreground">
          {rank}
        </span>
        <span className="text-sm font-semibold truncate flex-1 text-foreground">
          {entry.guestName}
        </span>
        {entry.isVip && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold shrink-0 text-amber-500">
            <Star size={10} fill="currentColor" />
            VIP
          </span>
        )}
        {isNotified && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-blue-500/15 text-blue-400">
            Notified
          </span>
        )}
      </div>

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
      </div>

      {/* Notes */}
      {entry.notes && (
        <p className="text-[11px] truncate mb-3 text-muted-foreground italic">
          {entry.notes}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSeat}
          className="flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold flex-1 h-9 transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
        >
          <ArrowRight size={13} />
          Seat
        </button>
        <button
          onClick={onNotify}
          className="flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium flex-1 h-9 transition-all active:scale-[0.97] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20"
        >
          <Bell size={12} />
          Notify
        </button>
        <button
          onClick={onRemove}
          aria-label={`Remove ${entry.guestName} from waitlist`}
          className="flex items-center justify-center rounded-lg h-9 w-9 shrink-0 transition-all active:scale-[0.97] bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
