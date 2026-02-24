'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { DataTable } from '@/components/ui/data-table';
import { formatReportMoney, downloadCsvExport } from '@/hooks/use-reports';
import type { ItemSalesRow } from '@/types/reports';

interface ItemsTabProps {
  data: ItemSalesRow[];
  isLoading: boolean;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
}

type ChartMode = 'quantity' | 'revenue';

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

const COLUMNS = [
  {
    key: 'catalogItemName',
    header: 'Item Name',
  },
  {
    key: 'quantitySold',
    header: 'Qty Sold',
  },
  {
    key: 'grossRevenue',
    header: 'Revenue',
    render: (row: Record<string, unknown>) => formatReportMoney(row.grossRevenue as number),
  },
  {
    key: 'quantityVoided',
    header: 'Qty Voided',
  },
  {
    key: 'voidRevenue',
    header: 'Void Amount',
    render: (row: Record<string, unknown>) => formatReportMoney(row.voidRevenue as number),
  },
];

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; mode: ChartMode } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-3 text-sm shadow-lg">
      <p className="font-semibold text-gray-900">{item.name}</p>
      <p className="text-gray-600">
        {item.mode === 'revenue'
          ? formatReportMoney(item.value)
          : `${item.value} sold`}
      </p>
    </div>
  );
}

export function ItemsTab({ data, isLoading, dateFrom, dateTo, locationId }: ItemsTabProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('quantity');

  const top10 = [...data]
    .sort((a, b) =>
      chartMode === 'revenue'
        ? b.grossRevenue - a.grossRevenue
        : b.quantitySold - a.quantitySold,
    )
    .slice(0, 10);

  const chartData = top10.map((r) => ({
    name: truncate(r.catalogItemName, 15),
    value: chartMode === 'revenue' ? r.grossRevenue : r.quantitySold,
    mode: chartMode,
  }));

  const handleExport = async () => {
    await downloadCsvExport('/api/v1/reports/item-sales/export', {
      dateFrom,
      dateTo,
      locationId,
    });
  };

  return (
    <div className="space-y-6">
      {/* Chart mode toggle + chart */}
      {!isLoading && data.length > 0 && (
        <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">Top 10 Items</h3>
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              <button
                type="button"
                onClick={() => setChartMode('quantity')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  chartMode === 'quantity'
                    ? 'bg-surface text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                By Quantity
              </button>
              <button
                type="button"
                onClick={() => setChartMode('revenue')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  chartMode === 'revenue'
                    ? 'bg-surface text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                By Revenue
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                tickFormatter={
                  chartMode === 'revenue'
                    ? (v: number) => `$${v.toLocaleString()}`
                    : undefined
                }
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        emptyMessage="No item sales data for this period"
      />

      {/* Export */}
      {data.length > 0 && (
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      )}
    </div>
  );
}
