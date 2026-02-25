'use client';

import { useState, useCallback } from 'react';
import {
  Users,
  Clock,
  Star,
  ArrowRight,
  Bell,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import {
  useHostDashboard,
  useWaitlistMutations,
  useReservationMutations,
} from '@/hooks/use-fnb-host';
import { useSectionActions } from '@/hooks/use-fnb-manager';
import { AddGuestDialog } from '@/components/fnb/host/AddGuestDialog';
import { useWaitTimeEstimate } from '@/hooks/use-fnb-host';

function getWaitColor(elapsed: number): string {
  if (elapsed >= 30) return 'var(--fnb-danger)';
  if (elapsed >= 15) return 'var(--fnb-warning)';
  return 'var(--fnb-success)';
}

export function WaitlistSidebarContent() {
  const { locations } = useAuthContext();
  const locationId = locations[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const {
    waitlist,
    reservations,
    servers,
    stats,
    isLoading,
  } = useHostDashboard({ locationId, businessDate: today });

  const waitlistMut = useWaitlistMutations(locationId);
  const resMut = useReservationMutations(locationId);
  const { advanceRotation, isActing } = useSectionActions();

  const [showAddGuest, setShowAddGuest] = useState(false);
  const [reservationsExpanded, setReservationsExpanded] = useState(false);

  const { estimate } = useWaitTimeEstimate(
    showAddGuest ? locationId : null,
    2,
    today,
  );

  const handleAddGuest = useCallback(
    async (input: Parameters<typeof waitlistMut.addToWaitlist>[0]) => {
      await waitlistMut.addToWaitlist(input);
      setShowAddGuest(false);
    },
    [waitlistMut],
  );

  const handleAdvanceRotation = useCallback(() => {
    advanceRotation(locationId, today);
  }, [advanceRotation, locationId, today]);

  // Sort waitlist by position
  const sorted = [...waitlist].sort((a, b) => a.position - b.position);

  // Upcoming reservations (not checked in, not cancelled/no-show)
  const upcoming = reservations.filter(
    (r) => r.status !== 'checked_in' && r.status !== 'cancelled' && r.status !== 'no_show'
  );

  // Server rotation data
  const rotationServers = servers.map((s) => ({
    id: s.serverUserId,
    name: s.serverName ?? 'Unknown',
    coverCount: s.coversServed,
    isNext: s.isNext,
  }));

  const nextServer = rotationServers.find((s) => s.isNext);

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--fnb-info)' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Quick stats row */}
      <div className="flex gap-2">
        <div
          className="flex-1 rounded-lg p-2 text-center"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <div className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}>
            {sorted.length}
          </div>
          <div className="text-[10px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
            Waiting
          </div>
        </div>
        <div
          className="flex-1 rounded-lg p-2 text-center"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <div className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}>
            {upcoming.length}
          </div>
          <div className="text-[10px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
            Reservations
          </div>
        </div>
        <div
          className="flex-1 rounded-lg p-2 text-center"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <div className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}>
            {stats?.avgWaitMinutes ?? 0}m
          </div>
          <div className="text-[10px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
            Avg Wait
          </div>
        </div>
      </div>

      {/* Add guest button */}
      <button
        type="button"
        onClick={() => setShowAddGuest(true)}
        className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors"
        style={{
          backgroundColor: 'var(--fnb-success)',
          color: '#fff',
          minHeight: '36px',
        }}
      >
        <Plus size={14} />
        Add to Waitlist
      </button>

      {/* Waitlist entries */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fnb-text-muted)' }}>
            Waitlist
          </span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-xs text-center py-3" style={{ color: 'var(--fnb-text-disabled)' }}>
            No guests waiting
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {sorted.map((entry) => (
              <WaitlistMiniCard
                key={entry.id}
                entry={entry}
                onSeat={() => waitlistMut.seatGuest({ id: entry.id, tableId: '' })}
                onNotify={() => waitlistMut.notifyGuest({ id: entry.id })}
                onRemove={() => waitlistMut.removeGuest({ id: entry.id })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upcoming reservations (collapsible) */}
      {upcoming.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setReservationsExpanded(!reservationsExpanded)}
            className="flex items-center justify-between w-full mb-1.5 px-0.5"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fnb-text-muted)' }}>
              Upcoming ({upcoming.length})
            </span>
            {reservationsExpanded
              ? <ChevronUp size={12} style={{ color: 'var(--fnb-text-muted)' }} />
              : <ChevronDown size={12} style={{ color: 'var(--fnb-text-muted)' }} />
            }
          </button>
          {reservationsExpanded && (
            <div className="flex flex-col gap-1">
              {upcoming.slice(0, 5).map((res) => (
                <ReservationMiniCard
                  key={res.id}
                  reservation={res}
                  onCheckIn={() => resMut.checkIn({ id: res.id })}
                />
              ))}
              {upcoming.length > 5 && (
                <p className="text-[10px] text-center py-1" style={{ color: 'var(--fnb-text-muted)' }}>
                  +{upcoming.length - 5} more
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Server rotation */}
      {rotationServers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fnb-text-muted)' }}>
              Rotation
            </span>
            <button
              type="button"
              onClick={handleAdvanceRotation}
              disabled={isActing}
              className="text-[10px] font-semibold transition-colors hover:opacity-80 disabled:opacity-40"
              style={{ color: 'var(--fnb-info)' }}
            >
              Advance
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {rotationServers.map((server) => (
              <span
                key={server.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium border"
                style={{
                  borderColor: server.isNext ? 'var(--fnb-status-seated)' : 'transparent',
                  backgroundColor: server.isNext
                    ? 'color-mix(in srgb, var(--fnb-status-seated) 12%, transparent)'
                    : 'var(--fnb-bg-elevated)',
                  color: server.isNext ? 'var(--fnb-status-seated)' : 'var(--fnb-text-secondary)',
                }}
              >
                {server.name}
                <span style={{ color: 'var(--fnb-text-muted)', fontFamily: 'var(--fnb-font-mono)' }}>
                  {server.coverCount}
                </span>
              </span>
            ))}
          </div>
          {nextServer && (
            <p className="text-[10px] mt-1 px-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
              Next up: <span style={{ color: 'var(--fnb-text-primary)', fontWeight: 600 }}>{nextServer.name}</span>
            </p>
          )}
        </div>
      )}

      {/* Add Guest Dialog */}
      <AddGuestDialog
        open={showAddGuest}
        onClose={() => setShowAddGuest(false)}
        onSubmit={handleAddGuest}
        waitEstimate={estimate}
        isSubmitting={waitlistMut.isAdding}
      />
    </div>
  );
}

// ── Mini Waitlist Card ────────────────────────────────────────────

function WaitlistMiniCard({
  entry,
  onSeat,
  onNotify,
  onRemove,
}: {
  entry: {
    id: string;
    guestName: string;
    partySize: number;
    elapsedMinutes: number;
    isVip: boolean;
    status: string;
    seatingPreference: string | null;
  };
  onSeat: () => void;
  onNotify: () => void;
  onRemove: () => void;
}) {
  const isNotified = entry.status === 'notified';

  return (
    <div
      className="rounded-lg p-2"
      style={{
        backgroundColor: 'var(--fnb-bg-elevated)',
        borderLeft: isNotified ? '2px solid var(--fnb-info)' : '2px solid transparent',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="text-xs font-semibold flex-1 truncate"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          {entry.guestName}
        </span>
        {entry.isVip && (
          <Star size={10} fill="#f59e0b" style={{ color: '#f59e0b', flexShrink: 0 }} />
        )}
        <span
          className="flex items-center gap-0.5 text-[10px] font-semibold shrink-0"
          style={{
            color: getWaitColor(entry.elapsedMinutes),
            fontFamily: 'var(--fnb-font-mono)',
          }}
        >
          <Clock size={10} />
          {entry.elapsedMinutes}m
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-0.5 text-[10px]"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          <Users size={10} />
          {entry.partySize}
        </span>
        {entry.seatingPreference && (
          <span
            className="text-[10px] rounded-full px-1.5 py-0.5"
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.12)',
              color: '#a78bfa',
            }}
          >
            {entry.seatingPreference}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={onSeat}
            className="flex items-center justify-center rounded h-6 w-6 transition-colors"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.12)', color: 'var(--fnb-success)' }}
            title="Seat"
          >
            <ArrowRight size={12} />
          </button>
          <button
            type="button"
            onClick={onNotify}
            className="flex items-center justify-center rounded h-6 w-6 transition-colors"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--fnb-info)' }}
            title="Notify"
          >
            <Bell size={12} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center justify-center rounded h-6 w-6 transition-colors"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: 'var(--fnb-danger)' }}
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mini Reservation Card ─────────────────────────────────────────

function ReservationMiniCard({
  reservation,
  onCheckIn,
}: {
  reservation: {
    id: string;
    guestName: string;
    partySize: number;
    reservationTime: string;
    status: string;
    minutesUntil: number;
    isVip: boolean;
  };
  onCheckIn: () => void;
}) {
  let timeStr = '';
  try {
    timeStr = new Date(reservation.reservationTime).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    timeStr = reservation.reservationTime;
  }

  return (
    <div
      className="rounded-lg p-2"
      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-[10px] font-bold shrink-0"
          style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}
        >
          {timeStr}
        </span>
        <span
          className="text-xs font-medium flex-1 truncate"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          {reservation.guestName}
        </span>
        {reservation.isVip && (
          <Star size={10} fill="#f59e0b" style={{ color: '#f59e0b', flexShrink: 0 }} />
        )}
        <span
          className="flex items-center gap-0.5 text-[10px]"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          <Users size={10} />
          {reservation.partySize}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span
          className="text-[10px] font-semibold"
          style={{
            color: reservation.minutesUntil <= 10 ? 'var(--fnb-warning)' : 'var(--fnb-text-muted)',
            fontFamily: 'var(--fnb-font-mono)',
          }}
        >
          {reservation.minutesUntil > 0 ? `in ${reservation.minutesUntil}m` : 'Now'}
        </span>
        {reservation.status === 'confirmed' && reservation.minutesUntil <= 15 && (
          <button
            type="button"
            onClick={onCheckIn}
            className="flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.12)', color: 'var(--fnb-success)' }}
          >
            <CheckCircle size={10} />
            Check In
          </button>
        )}
      </div>
    </div>
  );
}
