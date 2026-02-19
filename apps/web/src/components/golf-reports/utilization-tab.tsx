'use client';

import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { DataTable } from '@/components/ui/data-table';
import { useGolfUtilization, useTeeSheetKpis, downloadGolfExport } from '@/hooks/use-golf-reports';
import { formatBasisPoints, formatRoundCount, formatDateShort } from '@/lib/golf-formatters';
import type { GolfUtilizationRow } from '@/types/golf-reports';

interface UtilizationTabProps {
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
  { key: 'slotsBooked', header: 'Booked' },
  { key: 'slotsAvailable', header: 'Available' },
  { key: 'cancellations', header: 'Cancellations' },
  { key: 'noShows', header: 'No Shows' },
  {
    key: 'utilizationBps',
    header: 'Utilization',
    render: (row: Record<string, unknown>) => formatBasisPoints(row.utilizationBps as number),
  },
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GolfUtilizationRow & { dateLabel: string; utilizationPct: number } }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-3 text-sm shadow-lg">
      <p className="font-semibold text-gray-900">{row.dateLabel}</p>
      <p className="text-gray-600">Utilization: {formatBasisPoints(row.utilizationBps)}</p>
      <p className="text-gray-600">Booked: {row.slotsBooked} / {row.slotsAvailable}</p>
    </div>
  );
}

export function UtilizationTab({ dateFrom, dateTo, courseId, locationId }: UtilizationTabProps) {
  const utilization = useGolfUtilization({ dateFrom, dateTo, courseId, locationId });
  const kpis = useTeeSheetKpis({ dateFrom, dateTo, courseId, locationId });

  const sorted = [...utilization.data].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate),
  );

  const chartData = sorted.map((r) => ({
    ...r,
    dateLabel: formatDateShort(r.businessDate),
    utilizationPct: r.utilizationBps / 100,
  }));

  const handleExport = async () => {
    await downloadGolfExport('/api/v1/reports/golf/utilization/export', {
      dateFrom,
      dateTo,
      courseId,
      locationId,
    });
  };

  return (
    <div className="space-y-6">
      {/* KPI Mini Cards */}
      {kpis.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniCard label="Utilization" value={formatBasisPoints(kpis.data.utilizationBps)} />
          <MiniCard label="Slots Booked" value={formatRoundCount(kpis.data.slotsBooked)} />
          <MiniCard label="Cancellations" value={formatRoundCount(kpis.data.cancellations)} />
          <MiniCard label="No-Shows" value={formatRoundCount(kpis.data.noShows)} />
        </div>
      )}

      {/* Chart */}
      {!utilization.isLoading && utilization.data.length > 0 && (
        <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 text-sm font-medium text-gray-500">Utilization Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="utilizationPct"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={[...utilization.data].sort((a, b) => b.businessDate.localeCompare(a.businessDate)) as unknown as Record<string, unknown>[]}
        isLoading={utilization.isLoading}
        emptyMessage="No utilization data for this period"
      />

      {/* Export */}
      {utilization.data.length > 0 && (
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
