'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { DataTable } from '@/components/ui/data-table';
import { usePaceKpis, useGolfDayparts } from '@/hooks/use-golf-reports';
import { formatBasisPoints, formatDuration, formatRoundCount } from '@/lib/golf-formatters';
import type { GolfDaypartRow } from '@/types/golf-reports';

interface PaceOpsTabProps {
  dateFrom: string;
  dateTo: string;
  courseId?: string;
  locationId?: string;
}

const DAYPART_COLUMNS = [
  { key: 'label', header: 'Daypart' },
  { key: 'slotsBooked', header: 'Booked' },
  {
    key: 'pctOfTotalBps',
    header: '% of Total',
    render: (row: Record<string, unknown>) => formatBasisPoints(row.pctOfTotalBps as number),
  },
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GolfDaypartRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="font-semibold text-foreground">{row.label}</p>
      <p className="text-muted-foreground">Booked: {row.slotsBooked}</p>
      <p className="text-muted-foreground">Share: {formatBasisPoints(row.pctOfTotalBps)}</p>
    </div>
  );
}

export function PaceOpsTab({ dateFrom, dateTo, courseId, locationId }: PaceOpsTabProps) {
  const pace = usePaceKpis({ dateFrom, dateTo, courseId, locationId });
  const dayparts = useGolfDayparts({ dateFrom, dateTo, courseId, locationId });

  return (
    <div className="space-y-6">
      {/* KPI Mini Cards */}
      {pace.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniCard label="Avg Duration" value={formatDuration(pace.data.avgRoundDurationMin)} />
          <MiniCard label="Slow Round %" value={formatBasisPoints(pace.data.slowRoundPctBps)} />
          <MiniCard label="Avg Start Delay" value={formatDuration(pace.data.avgStartDelayMin)} />
          <MiniCard label="Late Start %" value={formatBasisPoints(pace.data.intervalComplianceBps)} />
        </div>
      )}

      {/* Pace Summary */}
      {pace.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniCard label="Rounds Completed" value={formatRoundCount(pace.data.roundsCompleted)} />
          <MiniCard label="Slow Rounds" value={formatRoundCount(pace.data.slowRoundsCount)} />
          <MiniCard label="Late Starts" value={formatRoundCount(pace.data.lateStartsCount)} />
          <MiniCard label="Avg Min/Hole" value={`${pace.data.avgMinutesPerHole.toFixed(1)}`} />
        </div>
      )}

      {/* Daypart Chart */}
      {!dayparts.isLoading && dayparts.data.length > 0 && (
        <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Bookings by Daypart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dayparts.data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="slotsBooked" name="Slots Booked" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daypart Table */}
      <DataTable
        columns={DAYPART_COLUMNS}
        data={dayparts.data as unknown as Record<string, unknown>[]}
        isLoading={dayparts.isLoading}
        emptyMessage="No daypart data for this period"
      />
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface p-3 ring-1 ring-gray-950/5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
