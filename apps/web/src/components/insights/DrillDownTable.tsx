'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface DrillDownTableProps {
  rows: Record<string, unknown>[];
  columns: string[];
  onDrillDown: (row: Record<string, unknown>, column: string) => void;
  drillPath: string[];
  onBreadcrumbClick: (level: number) => void;
  className?: string;
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  column: string;
  direction: SortDirection;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_VISIBLE_ROWS = 20;

const MONEY_KEYWORDS = ['sales', 'revenue', 'amount', 'total', 'cost', 'price', 'spend', 'income'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

// ── Helpers ────────────────────────────────────────────────────────

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isMoneyColumn(column: string): boolean {
  const lower = column.toLowerCase();
  return MONEY_KEYWORDS.some((kw) => lower.includes(kw));
}

function formatCellValue(value: unknown, column: string): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    if (isMoneyColumn(column)) return currencyFormatter.format(value);
    return numberFormatter.format(value);
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') {
      if (isMoneyColumn(column)) return currencyFormatter.format(num);
      return numberFormatter.format(num);
    }
  }
  return String(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;

  const numA = typeof a === 'number' ? a : Number(a);
  const numB = typeof b === 'number' ? b : Number(b);

  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

  return String(a).localeCompare(String(b));
}

// ── Component ──────────────────────────────────────────────────────

export function DrillDownTable({
  rows,
  columns,
  onDrillDown,
  drillPath,
  onBreadcrumbClick,
  className,
}: DrillDownTableProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [showAll, setShowAll] = useState(false);

  const handleSort = useCallback((column: string) => {
    setSort((prev) => {
      if (prev?.column === column) {
        return prev.direction === 'asc'
          ? { column, direction: 'desc' }
          : null;
      }
      return { column, direction: 'asc' };
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const { column, direction } = sort;
    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[column], b[column]);
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort]);

  const visibleRows = showAll ? sortedRows : sortedRows.slice(0, DEFAULT_VISIBLE_ROWS);
  const hasMoreRows = sortedRows.length > DEFAULT_VISIBLE_ROWS;

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Breadcrumb trail */}
      {drillPath.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/30 text-xs">
          <button
            type="button"
            onClick={() => onBreadcrumbClick(0)}
            className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors font-medium"
          >
            <ArrowLeft className="h-3 w-3" />
            All
          </button>
          {drillPath.map((segment, idx) => (
            <span key={idx} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              {idx < drillPath.length - 1 ? (
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick(idx + 1)}
                  className="text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  {segment}
                </button>
              ) : (
                <span className="text-foreground font-medium">{segment}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => {
                const isActive = sort?.column === col;
                return (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:bg-gray-200/50 transition-colors"
                    onClick={() => handleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {humanizeKey(col)}
                      {isActive && sort?.direction === 'asc' && (
                        <ChevronUp className="h-3.5 w-3.5 text-primary" />
                      )}
                      {isActive && sort?.direction === 'desc' && (
                        <ChevronDown className="h-3.5 w-3.5 text-primary" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No data available
                </td>
              </tr>
            )}
            {visibleRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="group hover:bg-gray-200/50 cursor-pointer transition-colors"
                onClick={() => onDrillDown(row, columns[0] ?? '')}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-2 text-foreground whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {formatCellValue(row[col], col)}
                      {col === columns[0] && (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show all toggle */}
      {hasMoreRows && (
        <div className="px-3 py-2 border-t border-border text-center">
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            {showAll
              ? 'Show fewer rows'
              : `Show all ${sortedRows.length} rows`}
          </button>
        </div>
      )}
    </div>
  );
}
