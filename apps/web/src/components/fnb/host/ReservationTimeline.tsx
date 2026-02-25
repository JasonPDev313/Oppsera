'use client';

import {
  CalendarPlus,
  Star,
  Users,
  Cake,
  Heart,
  Briefcase,
  GlassWater,
  PartyPopper,
  HelpCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CalendarCheck,
} from 'lucide-react';

interface Reservation {
  id: string;
  guestName: string;
  partySize: number;
  reservationTime: string;
  durationMinutes: number;
  status: string;
  occasion: string | null;
  isVip: boolean;
  assignedTableLabel: string | null;
  minutesUntil: number;
  notes: string | null;
}

interface ReservationTimelineProps {
  reservations: Reservation[];
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
  onAdd: () => void;
}

const OCCASION_ICONS: Record<string, { icon: typeof Cake; color: string }> = {
  birthday: { icon: Cake, color: '#f472b6' },
  anniversary: { icon: Heart, color: '#ef4444' },
  business: { icon: Briefcase, color: '#3b82f6' },
  date_night: { icon: GlassWater, color: '#a855f7' },
  celebration: { icon: PartyPopper, color: '#eab308' },
  other: { icon: HelpCircle, color: 'var(--fnb-text-muted)' },
};

function getStatusStyle(status: string): { bg: string; color: string; label: string } {
  switch (status) {
    case 'checked_in':
      return { bg: 'rgba(34, 197, 94, 0.12)', color: 'var(--fnb-success)', label: 'Checked In' };
    case 'confirmed':
      return { bg: 'rgba(59, 130, 246, 0.12)', color: 'var(--fnb-info)', label: 'Confirmed' };
    case 'cancelled':
      return { bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--fnb-danger)', label: 'Cancelled' };
    case 'no_show':
      return { bg: 'rgba(234, 179, 8, 0.12)', color: 'var(--fnb-warning)', label: 'No Show' };
    default:
      return { bg: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)', label: status };
  }
}

function formatTime(timeStr: string): string {
  try {
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return timeStr;
  }
}

export function ReservationTimeline({
  reservations,
  onCheckIn,
  onCancel,
  onNoShow,
  onAdd,
}: ReservationTimelineProps) {
  const arrivingSoon = reservations.filter(
    (r) => r.status !== 'checked_in' && r.status !== 'cancelled' && r.status !== 'no_show' && r.minutesUntil <= 30,
  );
  const laterToday = reservations.filter(
    (r) => r.status !== 'checked_in' && r.status !== 'cancelled' && r.status !== 'no_show' && r.minutesUntil > 30,
  );
  const checkedIn = reservations.filter((r) => r.status === 'checked_in');

  const activeCount = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'no_show',
  ).length;

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
            Reservations
          </span>
          {activeCount > 0 && (
            <span
              className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums"
              style={{
                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                color: 'var(--fnb-status-reserved)',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              {activeCount}
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all active:scale-95"
          style={{
            backgroundColor: 'var(--fnb-info)',
            color: '#fff',
            height: '36px',
          }}
        >
          <CalendarPlus size={14} />
          New Reservation
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="flex items-center justify-center h-14 w-14 rounded-full"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
            >
              <CalendarCheck size={24} style={{ color: 'var(--fnb-text-disabled)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
                No reservations today
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--fnb-text-disabled)' }}>
                Tap &quot;New Reservation&quot; to create one
              </p>
            </div>
          </div>
        ) : (
          <>
            {arrivingSoon.length > 0 && (
              <ReservationSection
                title="Arriving Soon"
                accent="var(--fnb-warning)"
                items={arrivingSoon}
                onCheckIn={onCheckIn}
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            )}
            {checkedIn.length > 0 && (
              <ReservationSection
                title="Checked In"
                accent="var(--fnb-success)"
                items={checkedIn}
                onCheckIn={onCheckIn}
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            )}
            {laterToday.length > 0 && (
              <ReservationSection
                title="Later Today"
                accent="var(--fnb-text-muted)"
                items={laterToday}
                onCheckIn={onCheckIn}
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReservationSection({
  title,
  accent,
  items,
  onCheckIn,
  onCancel,
  onNoShow,
}: {
  title: string;
  accent: string;
  items: Reservation[];
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
}) {
  return (
    <div>
      {/* Section header with accent dot */}
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: accent }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          {title}
        </span>
        <span
          className="text-[10px] font-bold tabular-nums"
          style={{ color: 'var(--fnb-text-disabled)', fontFamily: 'var(--fnb-font-mono)' }}
        >
          {items.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((res) => (
          <ReservationCard
            key={res.id}
            reservation={res}
            onCheckIn={() => onCheckIn(res.id)}
            onCancel={() => onCancel(res.id)}
            onNoShow={() => onNoShow(res.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ReservationCard({
  reservation,
  onCheckIn,
  onCancel,
  onNoShow,
}: {
  reservation: Reservation;
  onCheckIn: () => void;
  onCancel: () => void;
  onNoShow: () => void;
}) {
  const statusStyle = getStatusStyle(reservation.status);
  const occasionInfo = reservation.occasion ? OCCASION_ICONS[reservation.occasion] : null;
  const OccasionIcon = occasionInfo?.icon;
  const isCheckedIn = reservation.status === 'checked_in';
  const isTerminal = reservation.status === 'cancelled' || reservation.status === 'no_show';

  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
    >
      {/* Top row: time + name + badges */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-xs font-bold tabular-nums shrink-0"
          style={{
            color: 'var(--fnb-text-primary)',
            fontFamily: 'var(--fnb-font-mono)',
            minWidth: '52px',
          }}
        >
          {formatTime(reservation.reservationTime)}
        </span>
        <span
          className="text-sm font-semibold truncate flex-1"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          {reservation.guestName}
        </span>
        {reservation.isVip && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold shrink-0" style={{ color: '#f59e0b' }}>
            <Star size={10} fill="#f59e0b" />
            VIP
          </span>
        )}
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
        >
          {statusStyle.label}
        </span>
      </div>

      {/* Metadata chips */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--fnb-bg-surface)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          <Users size={11} />
          {reservation.partySize}
        </span>

        {OccasionIcon && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `color-mix(in srgb, ${occasionInfo!.color} 12%, transparent)`,
              color: occasionInfo!.color,
            }}
          >
            <OccasionIcon size={11} />
            {reservation.occasion!.replace('_', ' ')}
          </span>
        )}

        {reservation.assignedTableLabel && (
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: 'var(--fnb-info)',
            }}
          >
            {reservation.assignedTableLabel}
          </span>
        )}

        {!isCheckedIn && reservation.minutesUntil > 0 && (
          <span
            className="text-[11px] font-bold tabular-nums ml-auto"
            style={{
              color: reservation.minutesUntil <= 10 ? 'var(--fnb-warning)' : 'var(--fnb-text-muted)',
              fontFamily: 'var(--fnb-font-mono)',
            }}
          >
            in {reservation.minutesUntil}m
          </span>
        )}
      </div>

      {/* Notes */}
      {reservation.notes && (
        <p
          className="text-[11px] truncate mb-2"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          {reservation.notes}
        </p>
      )}

      {/* Actions — Check In is primary, No Show/Cancel are secondary */}
      {!isCheckedIn && !isTerminal && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onCheckIn}
            className="flex items-center justify-center gap-1 rounded-md text-xs font-semibold flex-1 transition-all active:scale-[0.97]"
            style={{
              backgroundColor: 'var(--fnb-success)',
              color: '#fff',
              height: '34px',
            }}
          >
            <CheckCircle size={13} />
            Check In
          </button>
          <button
            onClick={onNoShow}
            className="flex items-center justify-center gap-1 rounded-md text-xs font-medium transition-all active:scale-[0.97]"
            style={{
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              color: 'var(--fnb-warning)',
              height: '34px',
              padding: '0 10px',
            }}
          >
            <AlertTriangle size={12} />
            No Show
          </button>
          <button
            onClick={onCancel}
            className="flex items-center justify-center rounded-md transition-all active:scale-[0.97] shrink-0"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--fnb-danger)',
              height: '34px',
              width: '34px',
            }}
          >
            <XCircle size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
