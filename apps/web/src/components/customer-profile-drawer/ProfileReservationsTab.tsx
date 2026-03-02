'use client';

import { useState } from 'react';
import {
  Calendar,
  Clock,
  Users,
  Sparkles,
  Hotel,
  UtensilsCrossed,
  Flag,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useCustomerReservations } from '@/hooks/use-customer-360';
import type {
  CustomerReservationEntry,
  CustomerWaitlistEntry,
} from '@/types/customer-360';

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

function formatTime(time: string): string {
  try {
    if (time.includes(':')) {
      const [h, m] = time.split(':').map(Number);
      const period = (h ?? 0) >= 12 ? 'PM' : 'AM';
      const hour12 = (h ?? 0) % 12 || 12;
      return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
    }
    return time;
  } catch {
    return time;
  }
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-500/10 text-green-500 border-green-500/30',
  scheduled: 'bg-green-500/10 text-green-500 border-green-500/30',
  checked_in: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  completed: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  checked_out: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/30',
  canceled: 'bg-red-500/10 text-red-500 border-red-500/30',
  no_show: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  waiting: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  notified: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  seated: 'bg-green-500/10 text-green-500 border-green-500/30',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/30';
}

const MODULE_ICONS: Record<string, typeof Calendar> = {
  spa: Sparkles,
  pms: Hotel,
  dining: UtensilsCrossed,
  golf: Flag,
};

const MODULE_LABELS: Record<string, string> = {
  spa: 'Spa',
  pms: 'Hotel',
  dining: 'Dining',
  golf: 'Golf',
};

// ── Compact cards ───────────────────────────────────────────────

function CompactReservationCard({ item }: { item: CustomerReservationEntry }) {
  const Icon = MODULE_ICONS[item.module] ?? Calendar;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground truncate">{item.title}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(item.status)}`}>
            {item.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{formatDate(item.date)}</span>
          {item.time && <span>{formatTime(item.time)}</span>}
          {item.partySize != null && (
            <span className="flex items-center gap-0.5">
              <Users className="h-2.5 w-2.5" />
              {item.partySize}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactWaitlistCard({ item }: { item: CustomerWaitlistEntry }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">
            #{item.position} — {item.guestName}
          </span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(item.status)}`}>
            {item.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Party of {item.partySize}</span>
          {item.quotedWaitMinutes != null && <span>~{item.quotedWaitMinutes} min</span>}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

interface ProfileReservationsTabProps {
  customerId: string;
}

export function ProfileReservationsTab({ customerId }: ProfileReservationsTabProps) {
  const [timeframe, setTimeframe] = useState<'upcoming' | 'past' | 'all'>('all');
  const { data, isLoading, error, mutate: refresh } = useCustomerReservations(customerId, timeframe);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-xs text-red-500">Failed to load reservations</p>
        <button type="button" onClick={refresh} className="text-xs text-indigo-500 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  // Flatten all reservations for compact display (max 5 per module)
  const sections: { key: string; label: string; items: CustomerReservationEntry[] }[] = [];
  if ((data?.spa.length ?? 0) > 0) sections.push({ key: 'spa', label: 'Spa', items: data!.spa.slice(0, 5) });
  if ((data?.hotel.length ?? 0) > 0) sections.push({ key: 'hotel', label: 'Hotel', items: data!.hotel.slice(0, 5) });
  if ((data?.dining.length ?? 0) > 0) sections.push({ key: 'dining', label: 'Dining', items: data!.dining.slice(0, 5) });
  if ((data?.golf.length ?? 0) > 0) sections.push({ key: 'golf', label: 'Golf', items: data!.golf.slice(0, 5) });

  const totalCount =
    (data?.spa.length ?? 0) + (data?.hotel.length ?? 0) +
    (data?.dining.length ?? 0) + (data?.golf.length ?? 0);
  const hasWaitlist = (data?.waitlist.length ?? 0) > 0;

  return (
    <div className="space-y-3 p-3">
      {/* Time filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
          {(['all', 'upcoming', 'past'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tf.charAt(0).toUpperCase() + tf.slice(1)}
            </button>
          ))}
        </div>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {totalCount === 0 && !hasWaitlist ? (
        <EmptyState
          icon={Calendar}
          title="No reservations"
          description={
            timeframe === 'upcoming'
              ? 'No upcoming reservations.'
              : timeframe === 'past'
              ? 'No past reservations.'
              : 'No reservation history.'
          }
        />
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {section.label}
                <span className="text-[10px] font-normal">({section.items.length})</span>
              </div>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <CompactReservationCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}

          {hasWaitlist && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Waitlist
                <span className="text-[10px] font-normal">({data?.waitlist.length ?? 0})</span>
              </div>
              <div className="space-y-1.5">
                {data?.waitlist.slice(0, 5).map((item) => (
                  <CompactWaitlistCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
