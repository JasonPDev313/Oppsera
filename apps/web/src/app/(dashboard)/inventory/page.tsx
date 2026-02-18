'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Warehouse, AlertTriangle, Eye, Archive, History } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useInventory } from '@/hooks/use-inventory';
import { apiFetch } from '@/lib/api-client';
import type { InventoryItem } from '@/types/inventory';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'archived', label: 'Archived' },
];

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'food', label: 'F&B' },
  { value: 'retail', label: 'Retail' },
  { value: 'service', label: 'Service' },
  { value: 'other', label: 'Package' },
];

function getStockColor(item: InventoryItem): string {
  if (item.onHand < 0) return 'text-red-600';
  const reorderPoint = item.reorderPoint ? parseFloat(item.reorderPoint) : null;
  if (reorderPoint !== null && item.onHand <= reorderPoint) return 'text-amber-600';
  return 'text-green-600';
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active': return <Badge variant="success">Active</Badge>;
    case 'discontinued': return <Badge variant="warning">Discontinued</Badge>;
    case 'archived': return <Badge variant="neutral">Archived</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

function formatQty(val: number): string {
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(2);
}

type InventoryRow = InventoryItem & Record<string, unknown>;

export default function InventoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [itemType, setItemType] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Archive confirmation
  const [archiveTarget, setArchiveTarget] = useState<InventoryItem | null>(null);

  const { data: items, isLoading, hasMore, loadMore, mutate } = useInventory({
    status: status || undefined,
    itemType: itemType || undefined,
    search: search || undefined,
    lowStockOnly,
  });

  const handleArchive = useCallback(
    async (item: InventoryItem) => {
      const isArchived = item.status === 'archived';
      try {
        await apiFetch(`/api/v1/inventory/${item.id}/archive`, {
          method: 'POST',
          body: JSON.stringify({ archive: !isArchived }),
        });
        toast.success(isArchived ? `"${item.name}" unarchived` : `"${item.name}" archived`);
        mutate();
      } catch {
        toast.error(`Failed to ${isArchived ? 'unarchive' : 'archive'} item`);
      }
      setArchiveTarget(null);
    },
    [toast, mutate],
  );

  const buildActions = useCallback(
    (row: InventoryItem): ActionMenuItem[] => {
      const isArchived = row.status === 'archived';
      return [
        {
          key: 'view',
          label: 'View / Edit',
          icon: Eye,
          onClick: () => router.push(`/inventory/${row.id}`),
        },
        {
          key: 'changelog',
          label: 'Change Log',
          icon: History,
          onClick: () => router.push(`/inventory/${row.id}?tab=movements`),
        },
        {
          key: 'archive',
          label: isArchived ? 'Unarchive' : 'Archive',
          icon: Archive,
          destructive: !isArchived,
          dividerBefore: true,
          onClick: () => {
            if (isArchived) {
              handleArchive(row);
            } else {
              setArchiveTarget(row);
            }
          },
        },
      ];
    },
    [router, handleArchive],
  );

  const columns = [
    {
      key: 'name',
      header: 'Item',
      render: (row: InventoryRow) => (
        <div>
          <div className="font-medium text-gray-900">{row.name}</div>
          {row.sku && <div className="text-xs text-gray-500">{row.sku}</div>}
        </div>
      ),
    },
    {
      key: 'itemType',
      header: 'Type',
      render: (row: InventoryRow) => (
        <Badge variant="info">{row.itemType}</Badge>
      ),
    },
    {
      key: 'onHand',
      header: 'On Hand',
      render: (row: InventoryRow) => (
        <span className={`font-semibold ${getStockColor(row)}`}>
          {formatQty(row.onHand)} {row.baseUnit}
        </span>
      ),
    },
    {
      key: 'reorderPoint',
      header: 'Reorder Point',
      render: (row: InventoryRow) => (
        <span className="text-sm text-gray-500">
          {row.reorderPoint ? parseFloat(row.reorderPoint).toString() : '\u2014'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: InventoryRow) => getStatusBadge(row.status),
    },
    {
      key: 'actions',
      header: '',
      render: (row: InventoryRow) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={buildActions(row)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track stock levels across all locations
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or SKU..."
          className="w-full md:w-64"
        />
        <Select
          options={statusOptions}
          value={status}
          onChange={(v) => setStatus(v as string)}
          placeholder="All Statuses"
          className="w-full md:w-40"
        />
        <Select
          options={typeOptions}
          value={itemType}
          onChange={(v) => setItemType(v as string)}
          placeholder="All Types"
          className="w-full md:w-36"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Low Stock Only
        </label>
      </div>

      {/* Table */}
      {!isLoading && items.length === 0 && !search && !status && !itemType ? (
        <EmptyState
          icon={Warehouse}
          title="No inventory items"
          description="Inventory items are automatically created when catalog items are added."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items as InventoryRow[]}
            isLoading={isLoading}
            emptyMessage="No items match your filters"
            onRowClick={(row) => router.push(`/inventory/${row.id}`)}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}

      {/* Archive Confirmation */}
      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive Item"
        description={`Are you sure you want to archive "${archiveTarget?.name}"? Archived items won't appear in POS or active inventory views.`}
        confirmLabel="Archive"
        destructive
        onConfirm={() => archiveTarget && handleArchive(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
      />
    </div>
  );
}
