'use client';

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ComposedChart,
} from 'recharts';
import { DataTable } from '@/components/ui/data-table';
import { useGolfRevenue, downloadGolfExport } from '@/hooks/use-golf-reports';
import { formatGolfMoney, formatRoundCount, formatDateShort } from '@/lib/golf-formatters';
import type { GolfRevenueRow } from '@/types/golf-reports';

interface RevenueTabProps {
  dateFrom: string;
  dateTo: string;
  courseId?: string;
  locationId?: string;
}

const COLUMNS = [
  {
    key: 'businessDate',
    header: 'Date',
    render: (row: Record<string, unknown>) => formatDateShort(row.businessDate as string),
  },
  {
    key: 'greenFeeRevenue',
    header: 'Green Fees',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.greenFeeRevenue as number),
  },
  {
    key: 'cartFeeRevenue',
    header: 'Cart Fees',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.cartFeeRevenue as number),
  },
  {
    key: 'rangeFeeRevenue',
    header: 'Range',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.rangeFeeRevenue as number),
  },
  {
    key: 'foodBevRevenue',
    header: 'F&B',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.foodBevRevenue as number),
  },
  {
    key: 'proShopRevenue',
    header: 'Pro Shop',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.proShopRevenue as number),
  },
  {
    key: 'taxTotal',
    header: 'Tax',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.taxTotal as number),
  },
  {
    key: 'totalRevenue',
    header: 'Total',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.totalRevenue as number),
  },
  { key: 'roundsPlayed', header: 'Rounds' },
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GolfRevenueRow & { dateLabel: string } }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-3 text-sm shadow-lg">
      <p className="font-semibold text-gray-900">{row.dateLabel}</p>
      <p className="text-gray-600">Total Revenue: {formatGolfMoney(row.totalRevenue)}</p>
      <p className="text-gray-600">Green Fees: {formatGolfMoney(row.greenFeeRevenue)}</p>
      <p className="text-gray-600">Rounds: {row.roundsPlayed}</p>
    </div>
  );
}

export function RevenueTab({ dateFrom, dateTo, courseId, locationId }: RevenueTabProps) {
  const revenue = useGolfRevenue({ dateFrom, dateTo, courseId, locationId });

  const { chartData, totalRevenue, totalRounds, revPerRound } = useMemo(() => {
    const sorted = [...revenue.data].sort(
      (a, b) => a.businessDate.localeCompare(b.businessDate),
    );

    const totRev = revenue.data.reduce((s, r) => s + r.totalRevenue, 0);
    const totRnds = revenue.data.reduce((s, r) => s + r.roundsPlayed, 0);

    return {
      chartData: sorted.map((r) => ({
        ...r,
        dateLabel: formatDateShort(r.businessDate),
      })),
      totalRevenue: totRev,
      totalRounds: totRnds,
      revPerRound: totRnds > 0 ? totRev / totRnds : 0,
    };
  }, [revenue.data]);

  const handleExport = async () => {
    await downloadGolfExport('/api/v1/reports/golf/revenue/export', {
      dateFrom,
      dateTo,
      courseId,
      locationId,
    });
  };

  return (
    <div className="space-y-6">
      {/* KPI Mini Cards */}
      {!revenue.isLoading && revenue.data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniCard label="Total Revenue" value={formatGolfMoney(totalRevenue)} />
          <MiniCard label="Rounds Played" value={formatRoundCount(totalRounds)} />
          <MiniCard label="Rev / Round" value={formatGolfMoney(revPerRound)} />
        </div>
      )}

      {/* Chart */}
      {!revenue.isLoading && revenue.data.length > 0 && (
        <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 text-sm font-medium text-gray-500">Revenue by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="greenFeeRevenue" name="Green Fees" stackId="rev" fill="#22c55e" />
              <Bar dataKey="cartFeeRevenue" name="Cart" stackId="rev" fill="#3b82f6" />
              <Bar dataKey="foodBevRevenue" name="F&B" stackId="rev" fill="#f59e0b" />
              <Bar dataKey="proShopRevenue" name="Pro Shop" stackId="rev" fill="#8b5cf6" />
              <Bar dataKey="rangeFeeRevenue" name="Range" stackId="rev" fill="#06b6d4" />
              <Line
                type="monotone"
                dataKey="totalRevenue"
                name="Total"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={[...revenue.data].sort((a, b) => b.businessDate.localeCompare(a.businessDate)) as unknown as Record<string, unknown>[]}
        isLoading={revenue.isLoading}
        emptyMessage="No revenue data for this period"
      />

      {/* Export */}
      {revenue.data.length > 0 && (
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

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface p-3 ring-1 ring-gray-950/5">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
