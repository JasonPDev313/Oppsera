'use client';

import { useState } from 'react';
import { Star, Trash2, Pencil, X, Check } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import type { VendorCatalogEntry } from '@/types/vendors';

function formatMoney(value: number | null): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

type CatalogRow = VendorCatalogEntry & Record<string, unknown>;

interface VendorCatalogTableProps {
  items: VendorCatalogEntry[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSearch: (query: string) => void;
  onEdit: (item: VendorCatalogEntry) => void;
  onRemove: (itemVendorId: string) => void;
}

export function VendorCatalogTable({
  items,
  isLoading,
  hasMore,
  onLoadMore,
  onSearch,
  onEdit,
  onRemove,
}: VendorCatalogTableProps) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const columns = [
    {
      key: 'itemName',
      header: 'Item',
      render: (row: CatalogRow) => (
        <div>
          <span className="font-medium text-foreground">{row.itemName}</span>
          {row.itemSku && <span className="ml-2 text-xs text-muted-foreground">{row.itemSku}</span>}
        </div>
      ),
    },
    {
      key: 'vendorSku',
      header: 'Vendor SKU',
      render: (row: CatalogRow) => (
        <span className="text-sm text-muted-foreground">{row.vendorSku ?? '\u2014'}</span>
      ),
    },
    {
      key: 'vendorCost',
      header: 'Cost',
      render: (row: CatalogRow) => (
        <span className="text-sm font-medium text-foreground">{formatMoney(row.vendorCost)}</span>
      ),
    },
    {
      key: 'lastCost',
      header: 'Last Cost',
      render: (row: CatalogRow) => (
        <span className="text-sm text-muted-foreground">{formatMoney(row.lastCost)}</span>
      ),
    },
    {
      key: 'isPreferred',
      header: 'Preferred',
      render: (row: CatalogRow) =>
        row.isPreferred ? (
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'leadTimeDays',
      header: 'Lead Time',
      render: (row: CatalogRow) => (
        <span className="text-sm text-muted-foreground">
          {row.leadTimeDays != null ? `${row.leadTimeDays}d` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      render: (row: CatalogRow) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onEdit(row as VendorCatalogEntry)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {confirmRemove === row.id ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onRemove(row.id as string);
                  setConfirmRemove(null);
                }}
                className="rounded p-1.5 text-red-500 hover:bg-red-500/10"
                title="Confirm remove"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="rounded p-1.5 text-muted-foreground hover:bg-accent"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(row.id as string)}
              className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              title="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SearchInput
        onChange={onSearch}
        placeholder="Search catalog items..."
        className="max-w-sm"
      />

      <DataTable
        columns={columns}
        data={items as CatalogRow[]}
        isLoading={isLoading}
        emptyMessage="No catalog items. Add items this vendor supplies."
      />

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
