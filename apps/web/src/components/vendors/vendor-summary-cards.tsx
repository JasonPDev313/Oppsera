'use client';

import { Package, Receipt, DollarSign, CalendarDays } from 'lucide-react';
import type { VendorDetail } from '@/types/vendors';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function VendorSummaryCards({ vendor }: { vendor: VendorDetail }) {
  const cards = [
    {
      label: 'Catalog Items',
      value: String(vendor.activeCatalogItemCount),
      icon: Package,
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: 'Total Receipts',
      value: String(vendor.totalReceiptCount),
      icon: Receipt,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Total Spend',
      value: formatMoney(vendor.totalSpend),
      icon: DollarSign,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Last Receipt',
      value: vendor.lastReceiptDate ?? 'Never',
      icon: CalendarDays,
      color: 'text-purple-600 bg-purple-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <p className="truncate text-lg font-semibold text-gray-900">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
