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
  birthday: { icon: Cake, color: 'text-pink-500' },
  anniversary: { icon: Heart, color: 'text-red-500' },
  business: { icon: Briefcase, color: 'text-blue-500' },
  date_night: { icon: GlassWater, color: 'text-violet-500' },
  celebration: { icon: PartyPopper, color: 'text-amber-500' },
  other: { icon: HelpCircle, color: 'text-muted-foreground' },
};

const OCCASION_BG: Record<string, string> = {
  birthday: 'bg-pink-500/10',
  anniversary: 'bg-red-500/10',
  business: 'bg-blue-500/10',
  date_night: 'bg-violet-500/10',
  celebration: 'bg-amber-500/10',
  other: 'bg-gray-500/10',
};

function getStatusStyle(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'checked_in':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'Checked In' };
    case 'confirmed':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Confirmed' };
    case 'cancelled':
      return { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Cancelled' };
    case 'no_show':
      return { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'No Show' };
    default:
      return { bg: 'bg-gray-500/10', text: 'text-muted-foreground', label: status };
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
    <div className="flex flex-col h-full overflow-hidden rounded-xl bg-card border border-border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold text-foreground">
            Reservations
          </span>
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums bg-violet-500/10 text-violet-400">
              {activeCount}
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg px-3.5 h-9 text-xs font-semibold transition-all active:scale-95 bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
        >
          <CalendarPlus size={14} />
          New Reservation
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted border border-border">
              <CalendarCheck size={24} className="text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No reservations today
              </p>
              <p className="text-[11px] mt-0.5 text-muted-foreground/60">
                Tap &quot;New Reservation&quot; to create one
              </p>
            </div>
          </div>
        ) : (
          <>
            {arrivingSoon.length > 0 && (
              <ReservationSection
                title="Arriving Soon"
                accentDot="bg-amber-400"
                items={arrivingSoon}
                onCheckIn={onCheckIn}
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            )}
            {checkedIn.length > 0 && (
              <ReservationSection
                title="Checked In"
                accentDot="bg-emerald-400"
                items={checkedIn}
                onCheckIn={onCheckIn}
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            )}
            {laterToday.length > 0 && (
              <ReservationSection
                title="Later Today"
                accentDot="bg-gray-300"
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
  accentDot,
  items,
  onCheckIn,
  onCancel,
  onNoShow,
}: {
  title: string;
  accentDot: string;
  items: Reservation[];
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
}) {
  return (
    <div>
      {/* Section header with accent dot */}
      <div className="flex items-center gap-2 px-1 mb-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${accentDot}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="text-[10px] font-bold tabular-nums text-muted-foreground/60">
          {items.length}
        </span>
      </div>
      <div className="space-y-2" role="listbox" aria-label={`${title} reservations`}>
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
  const occasionBg = reservation.occasion ? OCCASION_BG[reservation.occasion] ?? 'bg-gray-500/10' : '';
  const OccasionIcon = occasionInfo?.icon;
  const isCheckedIn = reservation.status === 'checked_in';
  const isTerminal = reservation.status === 'cancelled' || reservation.status === 'no_show';

  return (
    <div
      role="option"
      aria-selected={false}
      aria-label={`${reservation.guestName}, party of ${reservation.partySize}, ${formatTime(reservation.reservationTime)}`}
      tabIndex={0}
      className="rounded-xl p-3.5 transition-all duration-150 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none bg-muted border border-border hover:border-gray-400/30"
    >
      {/* Top row: time + name + badges */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold tabular-nums shrink-0 text-foreground min-w-[52px]">
          {formatTime(reservation.reservationTime)}
        </span>
        <span className="text-sm font-semibold truncate flex-1 text-foreground">
          {reservation.guestName}
        </span>
        {reservation.isVip && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold shrink-0 text-amber-500">
            <Star size={10} fill="currentColor" />
            VIP
          </span>
        )}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </span>
      </div>

      {/* Metadata chips */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-500/10 text-muted-foreground">
          <Users size={11} />
          {reservation.partySize}
        </span>

        {OccasionIcon && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${occasionBg} ${occasionInfo!.color}`}>
            <OccasionIcon size={11} />
            {reservation.occasion!.replace('_', ' ')}
          </span>
        )}

        {reservation.assignedTableLabel && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
            {reservation.assignedTableLabel}
          </span>
        )}

        {!isCheckedIn && reservation.minutesUntil > 0 && (
          <span className={`text-[11px] font-bold tabular-nums ml-auto ${
            reservation.minutesUntil <= 10 ? 'text-amber-500' : 'text-muted-foreground'
          }`}>
            in {reservation.minutesUntil}m
          </span>
        )}
      </div>

      {/* Notes */}
      {reservation.notes && (
        <p className="text-[11px] truncate mb-2.5 text-muted-foreground italic">
          {reservation.notes}
        </p>
      )}

      {/* Actions */}
      {!isCheckedIn && !isTerminal && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onCheckIn}
            className="flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold flex-1 h-9 transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
          >
            <CheckCircle size={13} />
            Check In
          </button>
          <button
            onClick={onNoShow}
            className="flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium h-9 px-3 transition-all active:scale-[0.97] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20"
          >
            <AlertTriangle size={12} />
            No Show
          </button>
          <button
            onClick={onCancel}
            aria-label={`Cancel reservation for ${reservation.guestName}`}
            className="flex items-center justify-center rounded-lg h-9 w-9 shrink-0 transition-all active:scale-[0.97] bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
