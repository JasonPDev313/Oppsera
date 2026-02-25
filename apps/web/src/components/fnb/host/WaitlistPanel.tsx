'use client';

import { useState } from 'react';
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
      style={{
        background: 'var(--fnb-bg-surface)',
        borderRadius: 'var(--fnb-radius-lg)',
        border: 'var(--fnb-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--fnb-space-4)',
          borderBottom: 'var(--fnb-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--fnb-space-2)' }}>
          <span
            style={{
              color: 'var(--fnb-text-primary)',
              fontSize: 'var(--fnb-text-lg)',
              fontWeight: 'var(--fnb-font-semibold)',
            }}
          >
            Waitlist
          </span>
          <span
            style={{
              background: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
              fontSize: 'var(--fnb-text-xs)',
              fontWeight: 'var(--fnb-font-semibold)',
              padding: '2px 8px',
              borderRadius: 'var(--fnb-radius-full)',
              fontFamily: 'var(--fnb-font-mono)',
            }}
          >
            {entries.length}
          </span>
        </div>
        <button
          onClick={onAdd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--fnb-space-1)',
            background: 'var(--fnb-success)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--fnb-radius-md)',
            padding: '8px 12px',
            fontSize: 'var(--fnb-text-sm)',
            fontWeight: 'var(--fnb-font-semibold)',
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          <Plus size={16} />
          Add Guest
        </button>
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--fnb-space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--fnb-space-2)',
        }}
      >
        {sorted.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--fnb-space-12) var(--fnb-space-4)',
              gap: 'var(--fnb-space-3)',
            }}
          >
            <UserPlus
              size={48}
              style={{ color: 'var(--fnb-text-disabled)', opacity: 0.5 }}
            />
            <span
              style={{
                color: 'var(--fnb-text-muted)',
                fontSize: 'var(--fnb-text-base)',
              }}
            >
              No guests waiting
            </span>
          </div>
        ) : (
          sorted.map((entry) => (
            <WaitlistCard
              key={entry.id}
              entry={entry}
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
  onSeat,
  onNotify,
  onRemove,
}: {
  entry: WaitlistEntry;
  onSeat: () => void;
  onNotify: () => void;
  onRemove: () => void;
}) {
  const isNotified = entry.status === 'notified';

  return (
    <div
      style={{
        background: 'var(--fnb-bg-elevated)',
        borderRadius: 'var(--fnb-radius-lg)',
        padding: 'var(--fnb-card-padding)',
        borderLeft: isNotified ? '3px solid var(--fnb-info)' : '3px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--fnb-space-2)',
        transition: 'background var(--fnb-duration-micro) ease',
      }}
    >
      {/* Row 1: Name + VIP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--fnb-space-2)' }}>
        <span
          style={{
            color: 'var(--fnb-text-primary)',
            fontSize: 'var(--fnb-text-base)',
            fontWeight: 'var(--fnb-font-semibold)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.guestName}
        </span>
        {entry.isVip && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              color: '#f59e0b',
              fontSize: 'var(--fnb-text-xs)',
              fontWeight: 'var(--fnb-font-bold)',
            }}
          >
            <Star size={12} fill="#f59e0b" />
            VIP
          </span>
        )}
        {isNotified && (
          <span
            style={{
              fontSize: 'var(--fnb-text-xs)',
              color: 'var(--fnb-info)',
              fontWeight: 'var(--fnb-font-medium)',
            }}
          >
            Notified
          </span>
        )}
      </div>

      {/* Row 2: Party size + Wait time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--fnb-space-4)' }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--fnb-space-1)',
            color: 'var(--fnb-text-secondary)',
            fontSize: 'var(--fnb-text-sm)',
          }}
        >
          <Users size={14} />
          {entry.partySize}
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--fnb-space-1)',
            color: getWaitColor(entry.elapsedMinutes),
            fontSize: 'var(--fnb-text-sm)',
            fontFamily: 'var(--fnb-font-mono)',
            fontWeight: 'var(--fnb-font-semibold)',
          }}
        >
          <Clock size={14} />
          {entry.elapsedMinutes}m
        </span>
        {entry.seatingPreference && (
          <span
            style={{
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#a78bfa',
              fontSize: 'var(--fnb-text-xs)',
              fontWeight: 'var(--fnb-font-medium)',
              padding: '2px 8px',
              borderRadius: 'var(--fnb-radius-full)',
            }}
          >
            {entry.seatingPreference}
          </span>
        )}
      </div>

      {/* Row 3: Notes */}
      {entry.notes && (
        <div
          style={{
            color: 'var(--fnb-text-muted)',
            fontSize: 'var(--fnb-text-sm)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.notes}
        </div>
      )}

      {/* Row 4: Actions */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--fnb-space-2)',
          paddingTop: 'var(--fnb-space-1)',
        }}
      >
        <button
          onClick={onSeat}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(34, 197, 94, 0.15)',
            color: 'var(--fnb-success)',
            border: 'none',
            borderRadius: 'var(--fnb-radius-md)',
            padding: '6px 12px',
            fontSize: 'var(--fnb-text-sm)',
            fontWeight: 'var(--fnb-font-medium)',
            cursor: 'pointer',
            minHeight: '44px',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <ArrowRight size={14} />
          Seat
        </button>
        <button
          onClick={onNotify}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(59, 130, 246, 0.15)',
            color: 'var(--fnb-info)',
            border: 'none',
            borderRadius: 'var(--fnb-radius-md)',
            padding: '6px 12px',
            fontSize: 'var(--fnb-text-sm)',
            fontWeight: 'var(--fnb-font-medium)',
            cursor: 'pointer',
            minHeight: '44px',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <Bell size={14} />
          Notify
        </button>
        <button
          onClick={onRemove}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--fnb-danger)',
            border: 'none',
            borderRadius: 'var(--fnb-radius-md)',
            padding: '6px 10px',
            cursor: 'pointer',
            minHeight: '44px',
            minWidth: '44px',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
