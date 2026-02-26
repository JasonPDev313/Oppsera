'use client';

import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { DashboardTile as DashboardTileType, RunReportResult } from '@/types/custom-reports';

// ── Props ────────────────────────────────────────────────────
interface DashboardTileProps {
  tile: DashboardTileType;
  data: RunReportResult | null;
  isLoading: boolean;
  isEditing?: boolean;
  onRemove?: () => void;
  onEdit?: () => void;
  dragHandleProps?: Record<string, unknown>;
}

// ── Skeleton ─────────────────────────────────────────────────
function TileSkeleton() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full space-y-3">
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
        <div className="h-16 w-full animate-pulse rounded bg-muted-foreground/20" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
      </div>
    </div>
  );
}

// ── No Data ──────────────────────────────────────────────────
function NoData() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">No data</p>
    </div>
  );
}

// ── Chart Renderers ──────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
const CHART_GRID = '#e5e7eb';

/** Detect whether a column holds numeric data by sampling the first non-null value */
function isNumericColumn(rows: Record<string, unknown>[], col: string): boolean {
  for (const row of rows) {
    const val = row[col];
    if (val == null || val === '') continue;
    return typeof val === 'number' || !isNaN(Number(val));
  }
  return false;
}

/** Split columns into a label (x-axis) column and numeric value columns */
function classifyColumns(
  columns: string[],
  rows: Record<string, unknown>[],
): { xKey: string | null; valueKeys: string[] } {
  const numericCols: string[] = [];
  const labelCols: string[] = [];

  for (const col of columns) {
    if (isNumericColumn(rows, col)) {
      numericCols.push(col);
    } else {
      labelCols.push(col);
    }
  }

  // Use the first non-numeric column as x-axis; fall back to the first column
  const xKey = labelCols[0] ?? columns[0] ?? null;
  // Value keys are all numeric columns (exclude xKey if it ended up there)
  const valueKeys = numericCols.filter((c) => c !== xKey);

  return { xKey, valueKeys };
}

function LineChartTile({ data }: { data: RunReportResult }) {
  const { xKey, valueKeys } = classifyColumns(data.columns, data.rows);

  if (!xKey || valueKeys.length === 0) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            fontSize: '0.75rem',
          }}
        />
        {valueKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarChartTile({ data }: { data: RunReportResult }) {
  const { xKey, valueKeys } = classifyColumns(data.columns, data.rows);

  if (!xKey || valueKeys.length === 0) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            fontSize: '0.75rem',
          }}
        />
        {valueKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function TableTile({ data }: { data: RunReportResult }) {
  const displayRows = data.rows.slice(0, 10);

  return (
    <div className="h-full overflow-auto p-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {data.columns.map((col) => (
              <th
                key={col}
                className="px-2 py-1.5 text-left font-medium text-muted-foreground"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, idx) => (
            <tr key={idx} className="border-b border-border last:border-0">
              {data.columns.map((col) => (
                <td key={col} className="px-2 py-1 text-foreground">
                  {row[col] != null ? String(row[col]) : '\u2014'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length > 10 && (
        <p className="mt-1 px-2 text-xs text-muted-foreground">
          Showing 10 of {data.rows.length} rows
        </p>
      )}
    </div>
  );
}

function MetricTile({ data }: { data: RunReportResult }) {
  const firstRow = data.rows[0];
  if (!firstRow) return <NoData />;

  // Find the first numeric value in the first row
  let metricValue: string | null = null;
  let metricLabel: string | null = null;

  for (const col of data.columns) {
    const val = firstRow[col];
    if (val != null && !isNaN(Number(val))) {
      metricValue = String(val);
      metricLabel = col;
      break;
    }
  }

  if (metricValue === null) return <NoData />;

  // Format large numbers with commas
  const numericVal = Number(metricValue);
  const formatted = Number.isInteger(numericVal)
    ? numericVal.toLocaleString()
    : numericVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <span className="text-3xl font-bold text-foreground">{formatted}</span>
      {metricLabel && (
        <span className="mt-1 text-sm text-muted-foreground">{metricLabel}</span>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export function DashboardTile({
  tile,
  data,
  isLoading,
  isEditing = false,
  onRemove,
  onEdit,
  dragHandleProps,
}: DashboardTileProps) {
  const hasData = data !== null && data.rows.length > 0;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {isEditing && dragHandleProps && (
          <div
            {...dragHandleProps}
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {tile.title}
        </h3>

        {isEditing && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Edit tile"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                aria-label="Remove tile"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <TileSkeleton />
        ) : !hasData ? (
          <NoData />
        ) : tile.chartType === 'line' ? (
          <LineChartTile data={data} />
        ) : tile.chartType === 'bar' ? (
          <BarChartTile data={data} />
        ) : tile.chartType === 'table' ? (
          <TableTile data={data} />
        ) : tile.chartType === 'metric' ? (
          <MetricTile data={data} />
        ) : (
          <NoData />
        )}
      </div>
    </div>
  );
}
