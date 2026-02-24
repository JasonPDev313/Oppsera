'use client';

import { DollarSign, ShoppingCart, AlertTriangle, Users } from 'lucide-react';
import type { DashboardMetrics } from '@/types/reports';
import { formatReportMoney } from '@/hooks/use-reports';

interface MetricCardsProps {
  data: DashboardMetrics | null;
  isLoading: boolean;
}

const CARDS: {
  key: keyof DashboardMetrics;
  label: string;
  icon: typeof DollarSign;
  iconColor: string;
  format: (v: number) => string;
  warnWhen?: (v: number) => boolean;
}[] = [
  {
    key: 'todaySales',
    label: 'Total Sales',
    icon: DollarSign,
    iconColor: 'bg-green-100 text-green-600',
    format: formatReportMoney,
  },
  {
    key: 'todayOrders',
    label: 'Orders',
    icon: ShoppingCart,
    iconColor: 'bg-blue-100 text-blue-600',
    format: (v) => String(v),
  },
  {
    key: 'lowStockCount',
    label: 'Low Stock Items',
    icon: AlertTriangle,
    iconColor: 'bg-amber-100 text-amber-600',
    format: (v) => String(v),
    warnWhen: (v) => v > 0,
  },
  {
    key: 'activeCustomers30d',
    label: 'Active Customers',
    icon: Users,
    iconColor: 'bg-indigo-100 text-indigo-600',
    format: (v) => String(v),
  },
];

export function MetricCards({ data, isLoading }: MetricCardsProps) {
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
