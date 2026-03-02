'use client';

import { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Hotel,
  UtensilsCrossed,
  Flag,
  Clock,
  Users,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
      year: 'numeric',
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
  in_service: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
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

const MODULE_CONFIG = {
  spa: { label: 'Spa', icon: Sparkles, accent: 'text-pink-500' },
  hotel: { label: 'Hotel', icon: Hotel, accent: 'text-blue-500' },
  dining: { label: 'Dining', icon: UtensilsCrossed, accent: 'text-amber-500' },
  golf: { label: 'Golf', icon: Flag, accent: 'text-green-500' },
} as const;

// ── Sub-components ──────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-16 rounded-lg bg-muted" />
          <div className="h-16 rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ReservationCard({ item }: { item: CustomerReservationEntry }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
          <Badge variant="outline" className={getStatusColor(item.status)}>
            {item.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(item.date)}
          </span>
          {item.time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(item.time)}
              {item.endTime ? ` – ${formatTime(item.endTime)}` : ''}
            </span>
          )}
          {item.partySize != null && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {item.partySize} guest{item.partySize !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {item.notes && (
          <p className="mt-1 text-xs text-muted-foreground truncate">{item.notes}</p>
        )}
      </div>
    </div>
  );
}

function WaitlistCard({ item }: { item: CustomerWaitlistEntry }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            #{item.position} — {item.guestName}
          </span>
          <Badge variant="outline" className={getStatusColor(item.status)}>
            {item.status}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            Party of {item.partySize}
          </span>
          {item.quotedWaitMinutes != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{item.quotedWaitMinutes} min
            </span>
          )}
          <span>{formatDate(item.addedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function ModuleSection({
  moduleKey,
  items,
  defaultOpen = true,
}: {
  moduleKey: keyof typeof MODULE_CONFIG;
  items: CustomerReservationEntry[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const config = MODULE_CONFIG[moduleKey];
  const Icon = config.icon;

  if (items.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-accent transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Icon className={`h-4 w-4 ${config.accent}`} />
        <span className="text-sm font-medium text-foreground">{config.label}</span>
        <Badge variant="outline" className="ml-auto text-xs">
          {items.length}
        </Badge>
      </button>
      {isOpen && (
        <div className="space-y-2 px-4 pb-3">
          {items.map((item) => (
            <ReservationCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function ReservationsTab({ customerId }: { customerId: string }) {
  const [timeframe, setTimeframe] = useState<'upcoming' | 'past' | 'all'>('all');
  const { data, isLoading, error, mutate: refresh } = useCustomerReservations(customerId, timeframe);

  if (isLoading && !data) return <TabSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-red-500">Failed to load reservations</p>
        <button
          type="button"
          onClick={refresh}
          className="text-sm text-indigo-500 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalCount =
    (data?.spa.length ?? 0) +
    (data?.hotel.length ?? 0) +
    (data?.dining.length ?? 0) +
    (data?.golf.length ?? 0);

  const hasWaitlist = (data?.waitlist.length ?? 0) > 0;

  return (
    <div className="space-y-4 p-4">
      {/* Time filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {(['all', 'upcoming', 'past'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tf.charAt(0).toUpperCase() + tf.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      {/* Module sections */}
      {totalCount === 0 && !hasWaitlist ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">No reservations</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {timeframe === 'upcoming'
              ? 'No upcoming reservations found.'
              : timeframe === 'past'
              ? 'No past reservations found.'
              : 'No reservation history for this customer.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <ModuleSection moduleKey="spa" items={data?.spa ?? []} />
          <ModuleSection moduleKey="hotel" items={data?.hotel ?? []} />
          <ModuleSection moduleKey="dining" items={data?.dining ?? []} />
          <ModuleSection moduleKey="golf" items={data?.golf ?? []} />

          {/* Waitlist section */}
          {hasWaitlist && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-foreground">Waitlist</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {data?.waitlist.length ?? 0}
                </Badge>
              </div>
              <div className="space-y-2 px-4 pb-3">
                {data?.waitlist.map((item) => (
                  <WaitlistCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
