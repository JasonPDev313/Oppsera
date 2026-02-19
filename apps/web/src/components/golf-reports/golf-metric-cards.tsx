'use client';

import {
  Flag,
  DollarSign,
  BarChart3,
  Clock,
  XCircle,
  UserX,
  Globe,
} from 'lucide-react';
import type { GolfDashboardMetrics } from '@/types/golf-reports';
import {
  formatBasisPoints,
  formatGolfMoney,
  formatDuration,
  formatRoundCount,
  bpsStatus,
} from '@/lib/golf-formatters';

interface GolfMetricCardsProps {
  data: GolfDashboardMetrics | null;
  isLoading: boolean;
}

const CARDS: {
  key: keyof GolfDashboardMetrics;
  label: string;
  icon: typeof Flag;
  iconColor: string;
  format: (v: number) => string;
  warnWhen?: (v: number) => boolean;
}[] = [
  {
    key: 'todayRoundsPlayed',
    label: 'Rounds Today',
    icon: Flag,
    iconColor: 'bg-green-100 text-green-600',
    format: formatRoundCount,
  },
  {
    key: 'todayRevenue',
    label: 'Revenue Today',
    icon: DollarSign,
    iconColor: 'bg-emerald-100 text-emerald-600',
    format: formatGolfMoney,
  },
  {
    key: 'utilizationBps',
    label: 'Utilization',
    icon: BarChart3,
    iconColor: 'bg-blue-100 text-blue-600',
    format: formatBasisPoints,
    warnWhen: (v) => bpsStatus(v, 7000, 5000, 'below') !== 'ok',
  },
  {
    key: 'avgRoundDurationMin',
    label: 'Avg Round Duration',
    icon: Clock,
    iconColor: 'bg-indigo-100 text-indigo-600',
    format: formatDuration,
    warnWhen: (v) => bpsStatus(v, 270, 300, 'above') !== 'ok',
  },
  {
    key: 'cancelRateBps',
    label: 'Cancel Rate',
    icon: XCircle,
    iconColor: 'bg-orange-100 text-orange-600',
    format: formatBasisPoints,
    warnWhen: (v) => bpsStatus(v, 1500, 2500, 'above') !== 'ok',
  },
  {
    key: 'noShowRateBps',
    label: 'No-Show Rate',
    icon: UserX,
    iconColor: 'bg-red-100 text-red-600',
    format: formatBasisPoints,
    warnWhen: (v) => bpsStatus(v, 500, 1000, 'above') !== 'ok',
  },
  {
    key: 'onlinePctBps',
    label: 'Online Booking',
    icon: Globe,
    iconColor: 'bg-cyan-100 text-cyan-600',
    format: formatBasisPoints,
  },
];

export function GolfMetricCards({ data, isLoading }: GolfMetricCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = data ? data[card.key] : null;
        const isWarning = value !== null && card.warnWhen?.(value);

        return (
          <div
            key={card.key}
            className={`rounded-xl bg-surface p-6 shadow-sm ring-1 transition-shadow hover:shadow-md ${
              isWarning
                ? 'ring-amber-400/50'
                : 'ring-gray-950/5'
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  isWarning ? 'bg-amber-100 text-amber-600' : card.iconColor
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500">{card.label}</p>
                {isLoading || value === null ? (
                  <div className="mt-1 h-7 w-20 animate-pulse rounded bg-gray-200" />
                ) : (
                  <p className="truncate text-2xl font-bold text-gray-900">
                    {card.format(value)}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
