'use client';

import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { DataTable } from '@/components/ui/data-table';
import { formatReportMoney, downloadCsvExport } from '@/hooks/use-reports';
import type { DailySalesRow } from '@/types/reports';

interface SalesTabProps {
  data: DailySalesRow[];
  isLoading: boolean;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const COLUMNS = [
  {
    key: 'businessDate',
    header: 'Date',
    render: (row: Record<string, unknown>) => formatDateShort(row.businessDate as string),
  },
  {
    key: 'orderCount',
    header: 'Orders',
  },
  {
    key: 'grossSales',
    header: 'Gross Sales',
    render: (row: Record<string, unknown>) => formatReportMoney(row.grossSales as number),
  },
  {
    key: 'discountTotal',
    header: 'Discounts',
    render: (row: Record<string, unknown>) => formatReportMoney(row.discountTotal as number),
  },
  {
    key: 'taxTotal',
    header: 'Tax',
    render: (row: Record<string, unknown>) => formatReportMoney(row.taxTotal as number),
  },
  {
    key: 'netSales',
    header: 'Net Sales',
    render: (row: Record<string, unknown>) => formatReportMoney(row.netSales as number),
  },
  {
    key: 'tenderCash',
    header: 'Cash',
    render: (row: Record<string, unknown>) => formatReportMoney(row.tenderCash as number),
  },
  {
    key: 'tenderCard',
    header: 'Card',
    render: (row: Record<string, unknown>) => formatReportMoney(row.tenderCard as number),
  },
  {
    key: 'voidCount',
    header: 'Voids',
  },
  {
    key: 'avgOrderValue',
    header: 'Avg Order',
    render: (row: Record<string, unknown>) => formatReportMoney(row.avgOrderValue as number),
  },
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailySalesRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-3 text-sm shadow-lg">
      <p className="font-semibold text-gray-900">{formatDateShort(row.businessDate)}</p>
      <p className="text-gray-600">Net Sales: {formatReportMoney(row.netSales)}</p>
      <p className="text-gray-600">Gross Sales: {formatReportMoney(row.grossSales)}</p>
      <p className="text-gray-600">Orders: {row.orderCount}</p>
    </div>
  );
}

export function SalesTab({ data, isLoading, dateFrom, dateTo, locationId }: SalesTabProps) {
  const sorted = [...data].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate),
  );

  const chartData = sorted.map((r) => ({
    ...r,
    dateLabel: formatDateShort(r.businessDate),
    netSalesDollars: r.netSales / 100,
  }));

  const handleExport = async () => {
    await downloadCsvExport('/api/v1/reports/daily-sales/export', {
      dateFrom,
      dateTo,
      locationId,
    });
  };

  return (
    <div className="space-y-6">
      {/* Chart */}
      {!isLoading && data.length > 0 && (
        <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 text-sm font-medium text-gray-500">Net Sales Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toLocaleString()}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="netSalesDollars"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4, fill: '#6366f1' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={[...data].sort((a, b) => b.businessDate.localeCompare(a.businessDate)) as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        emptyMessage="No sales data for this period"
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
