'use client';

import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { Grid3X3 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  rowKey: string;
  colKey: string;
  value: number;
  label?: string;
}

export interface HeatmapGridProps {
  /** Unique row identifiers */
  rows: { key: string; label: string }[];
  /** Unique column identifiers */
  columns: { key: string; label: string }[];
  /** Flat array of cells — value drives color intensity */
  cells: HeatmapCell[];
  /** Format function for cell tooltip / display value */
  formatValue?: (value: number) => string;
  /** Color scale: 'green' (default), 'blue', 'red' */
  colorScale?: 'green' | 'blue' | 'red';
  /** Title displayed above the grid */
  title?: string;
  /** If true, show the value inside each cell */
  showValues?: boolean;
  /** Callback when a cell is clicked */
  onCellClick?: (rowKey: string, colKey: string, value: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR_RGB: Record<NonNullable<HeatmapGridProps['colorScale']>, string> = {
  green: '16, 185, 129',  // emerald-500
  blue: '59, 130, 246',   // blue-500
  red: '239, 68, 68',     // red-500
};

const MIN_OPACITY = 0.05;
const MAX_OPACITY = 1.0;

const DEFAULT_FORMAT = (v: number): string => v.toLocaleString();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a lookup map keyed by `rowKey::colKey` for O(1) cell access. */
function buildCellMap(cells: HeatmapCell[]): Map<string, HeatmapCell> {
  const map = new Map<string, HeatmapCell>();
  for (const cell of cells) {
    map.set(`${cell.rowKey}::${cell.colKey}`, cell);
  }
  return map;
}

/** Clamp a number between min and max inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Tooltip sub-component
// ---------------------------------------------------------------------------

interface TooltipState {
  rowLabel: string;
  colLabel: string;
  formattedValue: string;
  x: number;
  y: number;
}

function HeatmapTooltip({ tooltip }: { tooltip: TooltipState }) {
  return (
    <div
      className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-gray-200 bg-surface px-3 py-2 text-xs shadow-lg"
      style={{
        left: tooltip.x,
        top: tooltip.y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
    >
      <span className="font-medium text-gray-900">
        {tooltip.rowLabel} &times; {tooltip.colLabel}
      </span>
      <span className="text-gray-500">: </span>
      <span className="font-semibold text-gray-900">{tooltip.formattedValue}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HeatmapGrid({
  rows,
  columns,
  cells,
  formatValue = DEFAULT_FORMAT,
  colorScale = 'green',
  title,
  showValues = false,
  onCellClick,
}: HeatmapGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Pre-compute cell map and max value
  const cellMap = useMemo(() => buildCellMap(cells), [cells]);

  const maxValue = useMemo(() => {
    if (cells.length === 0) return 0;
    let max = 0;
    for (const cell of cells) {
      if (cell.value > max) max = cell.value;
    }
    return max;
  }, [cells]);

  const rgb = COLOR_RGB[colorScale];

  // Compute the background color for a given value
  const getCellBg = useCallback(
    (value: number): string => {
      if (maxValue === 0) return `rgba(${rgb}, ${MIN_OPACITY})`;
      const opacity = clamp(value / maxValue, MIN_OPACITY, MAX_OPACITY);
      return `rgba(${rgb}, ${opacity})`;
    },
    [maxValue, rgb],
  );

  // Compute contrasting text color for readability
  const getCellTextColor = useCallback(
    (value: number): string => {
      if (maxValue === 0) return 'inherit';
      const ratio = value / maxValue;
      // Use white text when opacity is high enough that dark text is hard to read
      return ratio > 0.55 ? 'rgba(255,255,255,0.95)' : 'inherit';
    },
    [maxValue],
  );

  const handleCellMouseEnter = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      rowLabel: string,
      colLabel: string,
      value: number,
    ) => {
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const cellRect = e.currentTarget.getBoundingClientRect();

      setTooltip({
        rowLabel,
        colLabel,
        formattedValue: formatValue(value),
        x: cellRect.left - containerRect.left + cellRect.width / 2,
        y: cellRect.top - containerRect.top,
      });
    },
    [formatValue],
  );

  const handleCellMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  if (cells.length === 0) {
    return (
      <div className="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-gray-950/5">
        {title && (
          <h3 className="mb-4 text-sm font-medium text-gray-500">{title}</h3>
        )}
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Grid3X3 className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-semibold text-gray-900">No data</p>
          <p className="mt-1 text-sm text-gray-500">
            There is no heatmap data to display.
          </p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Grid
  // -----------------------------------------------------------------------

  return (
    <div className="rounded-xl bg-surface p-4 shadow-sm ring-1 ring-gray-950/5">
      {title && (
        <h3 className="mb-4 text-sm font-medium text-gray-500">{title}</h3>
      )}

      {/* Scrollable container */}
      <div
        ref={containerRef}
        className="relative overflow-auto max-h-[500px]"
      >
        {/* Tooltip */}
        {tooltip && <HeatmapTooltip tooltip={tooltip} />}

        {/* CSS Grid */}
        <div
          className="inline-grid w-full"
          style={{
            gridTemplateColumns: `auto repeat(${columns.length}, minmax(48px, 1fr))`,
            gridTemplateRows: `auto repeat(${rows.length}, minmax(36px, 1fr))`,
          }}
        >
          {/* Top-left corner (empty) */}
          <div className="sticky left-0 top-0 z-20 bg-surface" />

          {/* Column headers */}
          {columns.map((col) => (
            <div
              key={`col-${col.key}`}
              className="sticky top-0 z-10 flex items-center justify-center bg-surface px-2 py-2 text-xs font-medium text-gray-500 select-none"
              title={col.label}
            >
              <span className="truncate">{col.label}</span>
            </div>
          ))}

          {/* Rows */}
          {rows.map((row) => (
            <Fragment key={`row-${row.key}`}>
              {/* Row header */}
              <div
                className="sticky left-0 z-10 flex items-center bg-surface pr-3 pl-1 text-xs font-medium text-gray-500 select-none"
                title={row.label}
              >
                <span className="truncate max-w-[120px]">{row.label}</span>
              </div>

              {/* Data cells */}
              {columns.map((col) => {
                const cell = cellMap.get(`${row.key}::${col.key}`);
                const value = cell?.value ?? 0;
                const isClickable = !!onCellClick;

                return (
                  <div
                    key={`${row.key}::${col.key}`}
                    className={`flex items-center justify-center border border-gray-950/5 text-xs font-medium transition-opacity ${
                      isClickable
                        ? 'cursor-pointer hover:opacity-80'
                        : ''
                    }`}
                    style={{
                      backgroundColor: getCellBg(value),
                      color: showValues ? getCellTextColor(value) : undefined,
                      minWidth: 48,
                      minHeight: 36,
                    }}
                    onMouseEnter={(e) =>
                      handleCellMouseEnter(e, row.label, col.label, value)
                    }
                    onMouseLeave={handleCellMouseLeave}
                    onClick={
                      isClickable
                        ? () => onCellClick(row.key, col.key, value)
                        : undefined
                    }
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onCellClick(row.key, col.key, value);
                            }
                          }
                        : undefined
                    }
                  >
                    {showValues && (
                      <span className="truncate px-1">
                        {cell?.label ?? formatValue(value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
