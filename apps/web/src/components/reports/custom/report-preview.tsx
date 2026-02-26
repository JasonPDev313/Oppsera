'use client';

import { useMemo, useCallback } from 'react';
import { AlertCircle, FileQuestion, Download, GripVertical } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FieldCatalogEntry, ChartType } from '@/types/custom-reports';

interface ReportPreviewProps {
  columns: string[];
  rows: Record<string, unknown>[];
  chartType: ChartType;
  isLoading: boolean;
  error: string | null;
  fieldCatalog: FieldCatalogEntry[];
  onColumnsReorder?: (newColumns: string[]) => void;
}

/** Parse composite key 'dataset:fieldKey' → { dataset, bareKey } */
function parseCatalogKey(compositeKey: string): { dataset: string | null; bareKey: string } {
  const colonIdx = compositeKey.indexOf(':');
  if (colonIdx === -1) return { dataset: null, bareKey: compositeKey };
  return { dataset: compositeKey.slice(0, colonIdx), bareKey: compositeKey.slice(colonIdx + 1) };
}

/** Find a field in the catalog by composite key (dataset:fieldKey) or bare fieldKey */
function findField(
  compositeKey: string,
  catalog: FieldCatalogEntry[],
): FieldCatalogEntry | undefined {
  const { dataset, bareKey } = parseCatalogKey(compositeKey);
  if (dataset) {
    return catalog.find((f) => f.dataset === dataset && f.fieldKey === bareKey);
  }
  return catalog.find((f) => f.fieldKey === bareKey);
}

function getFieldLabel(
  fieldKey: string,
  catalog: FieldCatalogEntry[],
): string {
  const field = findField(fieldKey, catalog);
  return field?.label ?? parseCatalogKey(fieldKey).bareKey;
}

function getFieldDataType(
  fieldKey: string,
  catalog: FieldCatalogEntry[],
): string {
  const field = findField(fieldKey, catalog);
  return field?.dataType ?? 'string';
}

function isNumericField(fieldKey: string, catalog: FieldCatalogEntry[]): boolean {
  return getFieldDataType(fieldKey, catalog) === 'number';
}

function isDateOrStringField(fieldKey: string, catalog: FieldCatalogEntry[]): boolean {
  const dt = getFieldDataType(fieldKey, catalog);
  return dt === 'date' || dt === 'string';
}

function isMetricField(fieldKey: string, catalog: FieldCatalogEntry[]): boolean {
  const field = findField(fieldKey, catalog);
  return field?.isMetric ?? false;
}

function isDimensionField(fieldKey: string, catalog: FieldCatalogEntry[]): boolean {
  const field = findField(fieldKey, catalog);
  return field ? !field.isMetric : false;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function CustomChartTooltip({
  active,
  payload,
  columns,
  catalog,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
  columns: string[];
  catalog: FieldCatalogEntry[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-lg">
      {columns.map((col) => (
        <p key={col} className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {getFieldLabel(col, catalog)}:
          </span>{' '}
          {formatCellValue(row[col])}
        </p>
      ))}
    </div>
  );
}

/** Generate a standalone CSV string from columns and rows (RFC 4180, UTF-8 BOM for Excel) */
function generateCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  fieldCatalog: FieldCatalogEntry[],
  totals: Record<string, number | null>,
): string {
  const BOM = '\uFEFF';
  const escape = (val: string) => {
    if (val.includes('"') || val.includes(',') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const headers = columns.map((col) => escape(getFieldLabel(col, fieldCatalog)));
  const dataRows = rows.map((row) =>
    columns.map((col) => {
      const v = row[col];
      if (v === null || v === undefined) return '';
      return escape(String(v));
    }).join(','),
  );

  // Totals row
  const totalsRow = columns.map((col, i) => {
    if (i === 0 && totals[col] === null) return escape('Total');
    const t = totals[col];
    if (t !== null && t !== undefined) return String(t);
    return '';
  }).join(',');

  return BOM + [headers.join(','), ...dataRows, totalsRow].join('\r\n') + '\r\n';
}

/** Trigger a browser download of a CSV string */
function downloadCsvFile(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportPreview({
  columns,
  rows,
  chartType,
  isLoading,
  error,
  fieldCatalog,
  onColumnsReorder,
}: ReportPreviewProps) {
  // Compute column totals for numeric fields
  const columnTotals = useMemo(() => {
    const totals: Record<string, number | null> = {};
    for (const col of columns) {
      if (isNumericField(col, fieldCatalog)) {
        let sum = 0;
        for (const row of rows) {
          const v = row[col];
          if (typeof v === 'number') sum += v;
          else if (typeof v === 'string' && v !== '') sum += Number(v) || 0;
        }
        totals[col] = Math.round(sum * 10000) / 10000; // avoid fp drift
      } else {
        totals[col] = null;
      }
    }
    return totals;
  }, [columns, rows, fieldCatalog]);

  const handleExportCsv = useCallback(() => {
    const csv = generateCsv(columns, rows, fieldCatalog, columnTotals);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(csv, `report-export-${timestamp}.csv`);
  }, [columns, rows, fieldCatalog, columnTotals]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-[300px] animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-500">Preview Error</p>
          <p className="mt-1 text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  // Empty / not yet run
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
        <FileQuestion className="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Select fields and a chart type to preview</p>
      </div>
    );
  }

  // Render based on chart type
  return (
    <div className="space-y-6">
      {chartType === 'metric' && (
        <MetricDisplay columns={columns} rows={rows} fieldCatalog={fieldCatalog} />
      )}
      {chartType === 'line' && (
        <LineChartDisplay
          columns={columns}
          rows={rows}
          fieldCatalog={fieldCatalog}
        />
      )}
      {chartType === 'bar' && (
        <BarChartDisplay
          columns={columns}
          rows={rows}
          fieldCatalog={fieldCatalog}
        />
      )}

      {/* Export CSV button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Data table for all chart types (with totals row + draggable columns) */}
      <PreviewDataTable
        columns={columns}
        rows={rows}
        fieldCatalog={fieldCatalog}
        columnTotals={columnTotals}
        onColumnsReorder={onColumnsReorder}
      />
    </div>
  );
}

// ── Metric display ─────────────────────────────────────────────

function MetricDisplay({
  columns,
  rows,
  fieldCatalog,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  fieldCatalog: FieldCatalogEntry[];
}) {
  const numericCol = columns.find((col) => isNumericField(col, fieldCatalog));
  if (!numericCol || rows.length === 0) return null;

  const value = rows[0]![numericCol];
  const label = getFieldLabel(numericCol, fieldCatalog);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-surface p-8 shadow-sm ring-1 ring-gray-950/5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-5xl font-bold text-foreground">
        {typeof value === 'number' ? value.toLocaleString() : String(value ?? '-')}
      </p>
    </div>
  );
}

// ── Line chart display ─────────────────────────────────────────

function LineChartDisplay({
  columns,
  rows,
  fieldCatalog,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  fieldCatalog: FieldCatalogEntry[];
}) {
  const xCol = useMemo(
    () => columns.find((col) => isDateOrStringField(col, fieldCatalog)),
    [columns, fieldCatalog],
  );
  const yCol = useMemo(
    () => columns.find((col) => isNumericField(col, fieldCatalog)),
    [columns, fieldCatalog],
  );

  if (!xCol || !yCol) return null;

  const xLabel = getFieldLabel(xCol, fieldCatalog);
  const yLabel = getFieldLabel(yCol, fieldCatalog);

  return (
    <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {yLabel} by {xLabel}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey={xCol}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            tickFormatter={(v: number) => v.toLocaleString()}
          />
          <Tooltip
            content={
              <CustomChartTooltip columns={columns} catalog={fieldCatalog} />
            }
          />
          <Line
            type="monotone"
            dataKey={yCol}
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 4, fill: '#6366f1' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Bar chart display ──────────────────────────────────────────

function BarChartDisplay({
  columns,
  rows,
  fieldCatalog,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  fieldCatalog: FieldCatalogEntry[];
}) {
  const dimensionCol = useMemo(
    () => columns.find((col) => isDimensionField(col, fieldCatalog)),
    [columns, fieldCatalog],
  );
  const metricCol = useMemo(
    () => columns.find((col) => isMetricField(col, fieldCatalog)),
    [columns, fieldCatalog],
  );

  if (!dimensionCol || !metricCol) return null;

  const dimLabel = getFieldLabel(dimensionCol, fieldCatalog);
  const metLabel = getFieldLabel(metricCol, fieldCatalog);

  return (
    <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {metLabel} by {dimLabel}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey={dimensionCol}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            tickFormatter={(v: number) => v.toLocaleString()}
          />
          <Tooltip
            content={
              <CustomChartTooltip columns={columns} catalog={fieldCatalog} />
            }
          />
          <Bar dataKey={metricCol} fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Sortable column header ─────────────────────────────────────

function SortableColumnHeader({
  id,
  label,
  canDrag,
}: {
  id: string;
  label: string;
  canDrag: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      <div className="flex items-center gap-1">
        {canDrag && (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}
        {label}
      </div>
    </th>
  );
}

// ── Preview data table ─────────────────────────────────────────

function PreviewDataTable({
  columns,
  rows,
  fieldCatalog,
  columnTotals,
  onColumnsReorder,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  fieldCatalog: FieldCatalogEntry[];
  columnTotals: Record<string, number | null>;
  onColumnsReorder?: (newColumns: string[]) => void;
}) {
  const hasAnyTotal = useMemo(
    () => Object.values(columnTotals).some((v) => v !== null),
    [columnTotals],
  );

  const canDrag = !!onColumnsReorder && columns.length > 1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onColumnsReorder) return;
      const oldIndex = columns.indexOf(active.id as string);
      const newIndex = columns.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      onColumnsReorder(arrayMove(columns, oldIndex, newIndex));
    },
    [columns, onColumnsReorder],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <SortableContext
                  items={columns}
                  strategy={horizontalListSortingStrategy}
                >
                  {columns.map((col) => (
                    <SortableColumnHeader
                      key={col}
                      id={col}
                      label={getFieldLabel(col, fieldCatalog)}
                      canDrag={canDrag}
                    />
                  ))}
                </SortableContext>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border last:border-0">
                  {columns.map((col) => (
                    <td key={col} className="px-4 py-3 text-sm text-foreground">
                      {formatCellValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hasAnyTotal && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-semibold">
                  {columns.map((col, i) => {
                    const total = columnTotals[col];
                    return (
                      <td key={col} className="px-4 py-3 text-sm text-foreground">
                        {total !== null && total !== undefined
                          ? total.toLocaleString()
                          : i === 0
                            ? 'Total'
                            : ''}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </DndContext>
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row, idx) => (
          <div key={idx} className="rounded-lg border border-border p-4">
            {columns.map((col) => (
              <div key={col} className="flex items-baseline justify-between py-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {getFieldLabel(col, fieldCatalog)}
                </span>
                <span className="text-sm text-foreground">
                  {formatCellValue(row[col])}
                </span>
              </div>
            ))}
          </div>
        ))}
        {hasAnyTotal && (
          <div className="rounded-lg border-2 border-border bg-muted p-4 font-semibold">
            {columns.map((col, i) => {
              const total = columnTotals[col];
              if (total === null && i !== 0) return null;
              return (
                <div key={col} className="flex items-baseline justify-between py-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {i === 0 && total === null ? 'Total' : getFieldLabel(col, fieldCatalog)}
                  </span>
                  <span className="text-sm text-foreground">
                    {total !== null && total !== undefined ? total.toLocaleString() : 'Total'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No results</p>
        </div>
      )}
    </div>
  );
}
