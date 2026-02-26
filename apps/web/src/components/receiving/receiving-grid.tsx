'use client';

import { useCallback, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { EditableCell } from './editable-cell';
import type { ComputedGridLine, FreightMode, GridTotals } from '@/lib/receiving-calc';

function formatMoney(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals > 2 ? 4 : 2,
  }).format(value);
}

// ── Column Definitions ──────────────────────────────────────────

const EDITABLE_COLS = ['qty', 'unitCost'] as const;

// ── Props ───────────────────────────────────────────────────────

interface ReceivingGridProps {
  lines: ComputedGridLine[];
  totals: GridTotals;
  isDraft: boolean;
  freightMode?: FreightMode;
  onUpdateLine: (lineId: string, field: 'quantityReceived' | 'unitCost', value: number) => void;
  onRemoveLine?: (lineId: string) => void;
  removingLineId?: string | null;
}

// ── Component ───────────────────────────────────────────────────

export function ReceivingGrid({
  lines,
  isDraft,
  freightMode = 'allocate',
  onUpdateLine,
  onRemoveLine,
  removingLineId,
}: ReceivingGridProps) {
  const isAllocateMode = freightMode === 'allocate';
  const gridRef = useRef<HTMLTableElement>(null);

  // ── Tab navigation between editable cells ───────────────────

  const handleTab = useCallback(
    (cellId: string, shiftKey: boolean) => {
      // cellId format: "rowIndex-colIndex" (e.g., "0-0" = first row qty, "0-1" = first row cost)
      const [rowStr, colStr] = cellId.split('-');
      const row = parseInt(rowStr!, 10);
      const col = parseInt(colStr!, 10);

      let nextRow = row;
      let nextCol = col;

      if (shiftKey) {
        // Move backward
        nextCol--;
        if (nextCol < 0) {
          nextCol = EDITABLE_COLS.length - 1;
          nextRow--;
        }
      } else {
        // Move forward
        nextCol++;
        if (nextCol >= EDITABLE_COLS.length) {
          nextCol = 0;
          nextRow++;
        }
      }

      // Wrap or clamp
      if (nextRow < 0) nextRow = lines.length - 1;
      if (nextRow >= lines.length) nextRow = 0;

      // Find and focus the target cell
      const targetId = `${nextRow}-${nextCol}`;
      const target = gridRef.current?.querySelector(
        `[data-cell-id="${targetId}"]`,
      ) as HTMLElement | null;
      if (target) {
        target.click(); // Click triggers edit mode for EditableCell
        target.focus();
      }
    },
    [lines.length],
  );

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-12">
        <p className="text-sm text-muted-foreground">No items added yet</p>
        {isDraft && (
          <p className="mt-1 text-xs text-muted-foreground">
            Use the search bar above to add items
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table ref={gridRef} className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Item
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                PLU / SKU
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rcvd Qty
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cur O/H
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total O/H
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rcvd Cost
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Product Cost
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cur Cost
              </th>
              {isAllocateMode && (
                <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Shipping
                </th>
              )}
              {isAllocateMode && (
                <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  New Wtd Cost
                </th>
              )}
              {isDraft && (
                <th className="w-10 px-2 py-2.5" />
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, rowIdx) => (
              <tr
                key={line.id}
                className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors"
              >
                {/* Item Name */}
                <td className="px-3 py-2 font-medium text-foreground max-w-[200px] truncate">
                  {line.itemName}
                </td>

                {/* PLU / SKU */}
                <td className="px-3 py-2 text-muted-foreground">
                  {line.itemSku ?? '—'}
                </td>

                {/* Received Qty (editable) */}
                <td className="px-1 py-1">
                  <EditableCell
                    value={line.quantityReceived}
                    onChange={(v) => onUpdateLine(line.id, 'quantityReceived', v)}
                    mode="integer"
                    cellId={`${rowIdx}-0`}
                    onTab={handleTab}
                    disabled={!isDraft}
                  />
                </td>

                {/* Current O/H */}
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {line.currentOnHand}
                </td>

                {/* Total O/H */}
                <td className="px-3 py-2 text-right">
                  <span
                    className={
                      line.totalOnHand < 0
                        ? 'font-medium text-red-500'
                        : 'font-medium text-green-500'
                    }
                  >
                    {line.totalOnHand}
                  </span>
                </td>

                {/* Received Unit Cost (editable) */}
                <td className="px-1 py-1">
                  <EditableCell
                    value={line.unitCost}
                    onChange={(v) => onUpdateLine(line.id, 'unitCost', v)}
                    mode="currency"
                    cellId={`${rowIdx}-1`}
                    onTab={handleTab}
                    disabled={!isDraft}
                  />
                </td>

                {/* Product Cost (computed) */}
                <td className="px-3 py-2 text-right font-medium text-foreground">
                  {formatMoney(line.productCost)}
                </td>

                {/* Current Unit Cost */}
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {formatMoney(line.currentUnitCost, 4)}
                </td>

                {/* Allocated Shipping (allocate mode only) */}
                {isAllocateMode && (
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatMoney(line.allocatedShipping, 4)}
                  </td>
                )}

                {/* New Weighted Cost (allocate mode only) */}
                {isAllocateMode && (
                  <td className="px-3 py-2 text-right">
                    <span className="font-semibold text-indigo-500">
                      {formatMoney(line.newWeightedCost, 4)}
                    </span>
                  </td>
                )}

                {/* Remove action */}
                {isDraft && (
                  <td className="px-2 py-2">
                    {onRemoveLine && (
                      <button
                        type="button"
                        onClick={() => onRemoveLine(line.id)}
                        disabled={removingLineId === line.id}
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 transition-colors"
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 p-3 lg:hidden">
        {lines.map((line, rowIdx) => (
          <div
            key={line.id}
            className="rounded-lg border border-border p-3 space-y-2"
          >
            {/* Item header */}
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">
                  {line.itemName}
                </div>
                {line.itemSku && (
                  <div className="text-xs text-muted-foreground">{line.itemSku}</div>
                )}
              </div>
              {isDraft && onRemoveLine && (
                <button
                  type="button"
                  onClick={() => onRemoveLine(line.id)}
                  disabled={removingLineId === line.id}
                  className="ml-2 rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Editable fields */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Rcvd Qty</label>
                <EditableCell
                  value={line.quantityReceived}
                  onChange={(v) => onUpdateLine(line.id, 'quantityReceived', v)}
                  mode="integer"
                  cellId={`m${rowIdx}-0`}
                  disabled={!isDraft}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Rcvd Cost</label>
                <EditableCell
                  value={line.unitCost}
                  onChange={(v) => onUpdateLine(line.id, 'unitCost', v)}
                  mode="currency"
                  cellId={`m${rowIdx}-1`}
                  disabled={!isDraft}
                />
              </div>
            </div>

            {/* Computed values */}
            <div className={`grid gap-2 text-xs ${isAllocateMode ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div>
                <span className="text-muted-foreground">Product Cost</span>
                <div className="font-medium">{formatMoney(line.productCost)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">O/H After</span>
                <div
                  className={
                    line.totalOnHand < 0
                      ? 'font-medium text-red-500'
                      : 'font-medium text-green-500'
                  }
                >
                  {line.totalOnHand}
                </div>
              </div>
              {isAllocateMode && (
                <div>
                  <span className="text-muted-foreground">New Cost</span>
                  <div className="font-semibold text-indigo-500">
                    {formatMoney(line.newWeightedCost, 4)}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
