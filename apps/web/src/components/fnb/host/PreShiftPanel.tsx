'use client';

import { AlertTriangle, Star, Users, PartyPopper, Utensils, Loader2 } from 'lucide-react';
import type { PreShiftData, PreShiftAlert } from '@/hooks/use-fnb-host';

interface PreShiftPanelProps {
  data: PreShiftData | null;
  isLoading: boolean;
}

const ALERT_ICONS: Record<PreShiftAlert['type'], typeof AlertTriangle> = {
  allergy: AlertTriangle,
  large_party: Users,
  occasion: PartyPopper,
  vip: Star,
};

const ALERT_STYLES: Record<PreShiftAlert['type'], { icon: string; bg: string; border: string }> = {
  allergy: { icon: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  large_party: { icon: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  occasion: { icon: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  vip: { icon: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
};

function SummaryCard({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 flex flex-col items-center bg-muted border border-border">
      <span className={`text-lg font-bold tabular-nums leading-none ${valueClass ?? 'text-foreground'}`}>
        {value}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wide mt-1 text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function PreShiftPanel({ data, isLoading }: PreShiftPanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Utensils size={24} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          No pre-shift data available
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto px-1">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard label="Reservations" value={data.totalReservations} />
        <SummaryCard label="Covers" value={data.expectedCovers} />
        <SummaryCard
          label="VIPs"
          value={data.vipCount}
          valueClass={data.vipCount > 0 ? 'text-indigo-600' : undefined}
        />
        <SummaryCard
          label="Large Parties"
          value={data.largePartyCount}
          valueClass={data.largePartyCount > 0 ? 'text-amber-500' : undefined}
        />
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">
            Alerts ({data.alerts.length})
          </span>
          <div className="flex flex-col gap-1.5">
            {data.alerts.map((alert, i) => {
              const Icon = ALERT_ICONS[alert.type];
              const styles = ALERT_STYLES[alert.type];
              return (
                <div
                  key={`${alert.reservationId}-${i}`}
                  className={`flex items-start gap-2 rounded-xl px-3 py-2 border ${styles.bg} ${styles.border}`}
                >
                  <Icon size={13} className={`shrink-0 mt-0.5 ${styles.icon}`} />
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium block text-foreground">
                      {alert.guestName} · {alert.time}
                    </span>
                    <span className="text-[10px] block text-muted-foreground">
                      {alert.message}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIP Arrivals */}
      {data.vipArrivals.length > 0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">
            VIP Arrivals
          </span>
          <div className="flex flex-col gap-1.5">
            {data.vipArrivals.map((vip) => (
              <div
                key={vip.reservationId}
                className="flex items-center gap-2 rounded-xl px-3 py-2 bg-muted border border-border"
              >
                <Star size={12} className="text-amber-500" fill="currentColor" />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium block text-foreground">
                    {vip.guestName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {vip.time} · {vip.partySize} guests
                    </span>
                    {vip.visitCount > 1 && (
                      <span className="text-[9px] font-medium rounded px-1.5 py-0.5 bg-blue-500/10 text-blue-400">
                        {vip.visitCount} visits
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff Assignments */}
      {data.staffAssignments.length > 0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">
            Staff Assignments
          </span>
          <div className="flex flex-col gap-1">
            {data.staffAssignments.map((staff) => (
              <div
                key={staff.serverName}
                className="flex items-center justify-between rounded-xl px-3 py-2 bg-muted border border-border"
              >
                <div className="min-w-0">
                  <span className="text-[11px] font-medium block text-foreground">
                    {staff.serverName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {staff.sectionNames.join(', ')}
                  </span>
                </div>
                <span className="text-[11px] font-bold tabular-nums shrink-0 text-muted-foreground">
                  {staff.expectedCovers} covers
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
