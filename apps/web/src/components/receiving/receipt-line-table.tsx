'use client';

import { Trash2 } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { CostImpactPreview } from './cost-impact-preview';
import type { ReceiptLine } from '@/types/receiving';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

interface ReceiptLineTableProps {
  lines: ReceiptLine[];
  isDraft: boolean;
  onRemoveLine?: (lineId: string) => void;
  isRemoving?: string | null;
}

type LineRow = ReceiptLine & Record<string, unknown>;

export function ReceiptLineTable({ lines, isDraft, onRemoveLine, isRemoving }: ReceiptLineTableProps) {
  const columns = [
    {
      key: 'item',
      header: 'Item',
      render: (row: LineRow) => (
        <div>
          <div className="font-medium text-foreground">{row.itemName}</div>
          {row.itemSku && <div className="text-xs text-muted-foreground">{row.itemSku}</div>}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      render: (row: LineRow) => (
        <span className="text-sm">
          {row.quantityReceived} {row.uomCode}
          {row.baseQty !== row.quantityReceived && (
            <span className="ml-1 text-xs text-muted-foreground">({row.baseQty} base)</span>
          )}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Unit Cost',
      render: (row: LineRow) => <span className="text-sm">{formatMoney(row.unitCost)}</span>,
    },
    {
      key: 'extendedCost',
      header: 'Extended',
      render: (row: LineRow) => <span className="text-sm">{formatMoney(row.extendedCost)}</span>,
    },
    {
      key: 'shipping',
      header: 'Shipping',
      render: (row: LineRow) => (
        <span className="text-sm text-muted-foreground">{formatMoney(row.allocatedShipping)}</span>
      ),
    },
    {
      key: 'landedCost',
      header: 'Landed',
      render: (row: LineRow) => (
        <div>
          <div className="text-sm font-medium">{formatMoney(row.landedCost)}</div>
          <div className="text-xs text-muted-foreground">{formatMoney(row.landedUnitCost)}/ea</div>
        </div>
      ),
    },
    ...(isDraft
      ? [
          {
            key: 'costPreview',
            header: 'Cost Impact',
            render: (row: LineRow) =>
              row.costPreview ? <CostImpactPreview preview={row.costPreview} /> : null,
          },
          {
            key: 'actions',
            header: '',
            render: (row: LineRow) =>
              onRemoveLine ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveLine(row.id); }}
                  disabled={isRemoving === row.id}
                  className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                  title="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={lines as LineRow[]}
      emptyMessage="No items added yet"
    />
  );
}
