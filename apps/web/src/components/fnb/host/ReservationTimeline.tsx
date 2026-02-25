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
      return { bg: 'rgba(34, 197, 94, 0.15)', color: 'var(--fnb-success)', label: 'Checked In' };
    case 'confirmed':
      return { bg: 'rgba(59, 130, 246, 0.15)', color: 'var(--fnb-info)', label: 'Confirmed' };
    case 'cancelled':
      return { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--fnb-danger)', label: 'Cancelled' };
    case 'no_show':
      return { bg: 'rgba(234, 179, 8, 0.15)', color: 'var(--fnb-warning)', label: 'No Show' };
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
    (r) => r.status !== 'checked_in' && r.status !== 'cancelled' && r.status !== 'no_show' && r.minutesUntil <= 30
  );
  const laterToday = reservations.filter(
    (r) => r.status !== 'checked_in' && r.status !== 'cancelled' && r.status !== 'no_show' && r.minutesUntil > 30
  );
  const checkedIn = reservations.filter((r) => r.status === 'checked_in');

  const activeCount = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'no_show'
  ).length;

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
            Reservations
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
            {activeCount}
          </span>
        </div>
        <button
          onClick={onAdd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--fnb-space-1)',
            background: 'var(--fnb-info)',
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
          <CalendarPlus size={16} />
          New Reservation
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--fnb-space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--fnb-space-4)',
        }}
      >
        {activeCount === 0 ? (
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
            <CalendarCheck
              size={48}
              style={{ color: 'var(--fnb-text-disabled)', opacity: 0.5 }}
            />
            <span
              style={{
                color: 'var(--fnb-text-muted)',
                fontSize: 'var(--fnb-text-base)',
              }}
            >
              No reservations today
            </span>
          </div>
        ) : (
          <>
            {arrivingSoon.length > 0 && (
              <ReservationSection
                title="Arriving Soon"
                items={arrivingSoon}
                onCheckIn={onCheckIn}
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            )}
            {checkedIn.length > 0 && (
              <ReservationSection
                title="Checked In"
                items={checkedIn}
                onCheckIn={onCheckIn}
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            )}
            {laterToday.length > 0 && (
              <ReservationSection
                title="Later Today"
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
  items,
  onCheckIn,
  onCancel,
  onNoShow,
}: {
  title: string;
  items: Reservation[];
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fnb-space-2)' }}>
      <span
        style={{
          color: 'var(--fnb-text-muted)',
          fontSize: 'var(--fnb-text-xs)',
          fontWeight: 'var(--fnb-font-semibold)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          paddingLeft: 'var(--fnb-space-1)',
        }}
      >
        {title} ({items.length})
      </span>
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

  return (
    <div
      style={{
        background: 'var(--fnb-bg-elevated)',
        borderRadius: 'var(--fnb-radius-lg)',
        padding: 'var(--fnb-card-padding)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--fnb-space-2)',
      }}
    >
      {/* Row 1: Time + Name + VIP + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--fnb-space-2)' }}>
        <span
          style={{
            color: 'var(--fnb-text-primary)',
            fontSize: 'var(--fnb-text-base)',
            fontWeight: 'var(--fnb-font-bold)',
            fontFamily: 'var(--fnb-font-mono)',
            minWidth: '60px',
          }}
        >
          {formatTime(reservation.reservationTime)}
        </span>
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
          {reservation.guestName}
        </span>
        {reservation.isVip && (
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
        <span
          style={{
            background: statusStyle.bg,
            color: statusStyle.color,
            fontSize: 'var(--fnb-text-xs)',
            fontWeight: 'var(--fnb-font-medium)',
            padding: '2px 8px',
            borderRadius: 'var(--fnb-radius-full)',
          }}
        >
          {statusStyle.label}
        </span>
      </div>

      {/* Row 2: Party size + Occasion + Table + Minutes until */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--fnb-space-3)',
          flexWrap: 'wrap',
        }}
      >
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
          {reservation.partySize}
        </span>
        {OccasionIcon && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: occasionInfo!.color,
              fontSize: 'var(--fnb-text-xs)',
              fontWeight: 'var(--fnb-font-medium)',
            }}
          >
            <OccasionIcon size={14} />
            {reservation.occasion!.replace('_', ' ')}
          </span>
        )}
        {reservation.assignedTableLabel && (
          <span
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--fnb-info)',
              fontSize: 'var(--fnb-text-xs)',
              fontWeight: 'var(--fnb-font-medium)',
              padding: '2px 8px',
              borderRadius: 'var(--fnb-radius-full)',
            }}
          >
            {reservation.assignedTableLabel}
          </span>
        )}
        {!isCheckedIn && reservation.minutesUntil > 0 && (
          <span
            style={{
              color: reservation.minutesUntil <= 10 ? 'var(--fnb-warning)' : 'var(--fnb-text-muted)',
              fontSize: 'var(--fnb-text-sm)',
              fontFamily: 'var(--fnb-font-mono)',
              fontWeight: 'var(--fnb-font-semibold)',
              marginLeft: 'auto',
            }}
          >
            in {reservation.minutesUntil}m
          </span>
        )}
      </div>

      {/* Notes */}
      {reservation.notes && (
        <div
          style={{
            color: 'var(--fnb-text-muted)',
            fontSize: 'var(--fnb-text-sm)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {reservation.notes}
        </div>
      )}

      {/* Actions */}
      {!isCheckedIn && reservation.status !== 'cancelled' && reservation.status !== 'no_show' && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--fnb-space-2)',
            paddingTop: 'var(--fnb-space-1)',
          }}
        >
          <button
            onClick={onCheckIn}
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
            <CheckCircle size={14} />
            Check In
          </button>
          <button
            onClick={onNoShow}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(234, 179, 8, 0.15)',
              color: 'var(--fnb-warning)',
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
            <AlertTriangle size={14} />
            No Show
          </button>
          <button
            onClick={onCancel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--fnb-danger)',
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
            <XCircle size={14} />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
