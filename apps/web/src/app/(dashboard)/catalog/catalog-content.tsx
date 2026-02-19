'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Package, AlertTriangle, Pencil, Power, RotateCcw, History } from 'lucide-react';
import { useItemEditDrawer } from '@/components/inventory/ItemEditDrawerContext';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useCatalogItems, useDepartments, useSubDepartments, useCategories, archiveCatalogItem, unarchiveCatalogItem } from '@/hooks/use-catalog';
import { getItemTypeGroup, ITEM_TYPE_BADGES } from '@/types/catalog';
import type { CatalogItemRow } from '@/types/catalog';
import { ItemChangeLogModal } from '@/components/catalog/ItemChangeLogModal';

const typeFilterOptions = [
  { value: '', label: 'All Types' },
  { value: 'fnb', label: 'F&B' },
  { value: 'retail', label: 'Retail' },
  { value: 'service', label: 'Service' },
  { value: 'package', label: 'Package' },
];

const typeToBackend: Record<string, string | undefined> = {
  fnb: 'food',
  retail: 'retail',
  service: 'service',
  package: 'other',
};

function formatPrice(price: string | null): string {
  if (!price) return '-';
  return `$${Number(price).toFixed(2)}`;
}

function formatQty(val: number): string {
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(2);
}

function getStockColor(onHand: number, reorderPoint: number | null): string {
  if (onHand < 0) return 'text-red-600';
  if (reorderPoint !== null && onHand <= reorderPoint) return 'text-amber-600';
  return 'text-green-600';
}

type EnrichedRow = CatalogItemRow & {
  onHand?: number;
  reorderPoint?: string | null;
  baseUnit?: string;
  inventoryItemId?: string;
  inventoryStatus?: string;
} & Record<string, unknown>;

export default function CatalogPage() {
  const router = useRouter();
  const { toast } = useToast();
  const itemEditDrawer = useItemEditDrawer();
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [subDeptId, setSubDeptId] = useState('');
  const [catId, setCatId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<EnrichedRow | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [reactivateTarget, setReactivateTarget] = useState<EnrichedRow | null>(null);
  const [historyItem, setHistoryItem] = useState<{ id: string; name: string } | null>(null);

  const { data: departments } = useDepartments();
  const { data: subDepartments } = useSubDepartments(deptId || undefined);
  const { data: categories } = useCategories(subDeptId || undefined);

  const { data: items, isLoading, hasMore, loadMore, mutate } = useCatalogItems({
    categoryId: catId || undefined,
    itemType: typeToBackend[typeFilter],
    includeArchived: showAll ? true : undefined,
    search: search || undefined,
    includeInventory: true,
  });

  // Items already come enriched with inventory data from the server.
  // Apply low-stock client-side filter when enabled.
  const enrichedItems: EnrichedRow[] = useMemo(() => {
    const rows = (items ?? []) as EnrichedRow[];
    if (!lowStockOnly) return rows;
    return rows.filter((item) => {
      if (item.onHand === undefined) return false;
      const rp = item.reorderPoint ? parseFloat(item.reorderPoint) : null;
      return rp !== null && item.onHand <= rp;
    });
  }, [items, lowStockOnly]);

  const deptOptions = useMemo(
    () => [{ value: '', label: 'All Departments' }, ...departments.map((d) => ({ value: d.id, label: d.name }))],
    [departments],
  );

  const subDeptOptions = useMemo(
    () => [{ value: '', label: 'All Sub-Depts' }, ...subDepartments.map((s) => ({ value: s.id, label: s.name }))],
    [subDepartments],
  );

  const catOptions = useMemo(
    () => [{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    [categories],
  );

  const handleDeactivate = useCallback(
    async () => {
      if (!deactivateTarget) return;
      try {
        const reason = deactivateReason.trim() || undefined;
        await archiveCatalogItem(deactivateTarget.id, reason);
        toast.success(`"${deactivateTarget.name}" deactivated`);
        mutate();

      } catch {
        toast.error('Failed to deactivate item');
      }
      setDeactivateTarget(null);
      setDeactivateReason('');
    },
    [deactivateTarget, deactivateReason, toast, mutate],
  );

  const handleReactivate = useCallback(
    async () => {
      if (!reactivateTarget) return;
      try {
        await unarchiveCatalogItem(reactivateTarget.id);
        toast.success(`"${reactivateTarget.name}" reactivated`);
        mutate();

      } catch {
        toast.error('Failed to reactivate item');
      }
      setReactivateTarget(null);
    },
    [reactivateTarget, toast, mutate],
  );

  const openDrawer = useCallback(
    (row: EnrichedRow) => {
      itemEditDrawer.open(row.id, { onSaveSuccess: () => mutate() });
    },
    [itemEditDrawer, mutate],
  );

  const buildActions = useCallback(
    (row: EnrichedRow): ActionMenuItem[] => {
      const actions: ActionMenuItem[] = [
        {
          key: 'edit',
          label: 'Edit Item',
          icon: Pencil,
          onClick: () => openDrawer(row),
        },
        {
          key: 'history',
          label: 'View History',
          icon: History,
          onClick: () => setHistoryItem({ id: row.id, name: row.name }),
        },
      ];
      if (row.archivedAt) {
        actions.push({
          key: 'reactivate',
          label: 'Reactivate',
          icon: RotateCcw,
          dividerBefore: true,
          onClick: () => setReactivateTarget(row),
        });
      } else {
        actions.push({
          key: 'deactivate',
          label: 'Deactivate',
          icon: Power,
          destructive: true,
          dividerBefore: true,
          onClick: () => setDeactivateTarget(row),
        });
      }
      return actions;
    },
    [openDrawer],
  );

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: EnrichedRow) => (
        <div>
          <span className="font-medium text-gray-900">{row.name}</span>
          {row.sku && <div className="text-xs text-gray-500">{row.sku}</div>}
        </div>
      ),
    },
    {
      key: 'itemType',
      header: 'Type',
      render: (row: EnrichedRow) => {
        const group = getItemTypeGroup(row.itemType, row.metadata);
        const badge = ITEM_TYPE_BADGES[group];
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'defaultPrice',
      header: 'Price',
      render: (row: EnrichedRow) => formatPrice(row.defaultPrice),
    },
    {
      key: 'onHand',
      header: 'On Hand',
      render: (row: EnrichedRow) => {
        if (row.onHand === undefined) return <span className="text-sm text-gray-400">-</span>;
        const reorderPt = row.reorderPoint ? parseFloat(row.reorderPoint) : null;
        return (
          <span className={`font-semibold ${getStockColor(row.onHand, reorderPt)}`}>
            {formatQty(row.onHand)} {row.baseUnit ?? ''}
          </span>
        );
      },
    },
    {
      key: 'reorderPoint',
      header: 'Reorder Pt',
      render: (row: EnrichedRow) => (
        <span className="text-sm text-gray-500">
          {row.reorderPoint ? parseFloat(row.reorderPoint).toString() : '\u2014'}
        </span>
      ),
    },
    {
      key: 'categoryName',
      header: 'Category',
      render: (row: EnrichedRow) => (
        <span className="text-gray-500">{row.categoryName || '-'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: EnrichedRow) => (
        <Badge variant={!row.archivedAt ? 'success' : 'neutral'}>
          {!row.archivedAt ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: EnrichedRow) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu items={buildActions(row)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Inventory Items</h1>
        <button
          type="button"
          onClick={() => router.push('/catalog/items/new')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Add Item
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or SKU..."
          className="w-full md:w-64"
        />
        <Select
          options={deptOptions}
          value={deptId}
          onChange={(v) => {
            setDeptId(v as string);
            setSubDeptId('');
            setCatId('');
          }}
          placeholder="All Departments"
          className="w-full md:w-48"
        />
        <Select
          options={subDeptOptions}
          value={subDeptId}
          onChange={(v) => {
            setSubDeptId(v as string);
            setCatId('');
          }}
          placeholder="All Sub-Depts"
          className="w-full md:w-48"
        />
        <Select
          options={catOptions}
          value={catId}
          onChange={(v) => setCatId(v as string)}
          placeholder="All Categories"
          className="w-full md:w-48"
        />
        <Select
          options={typeFilterOptions}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as string)}
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
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Include Inactive
        </label>
      </div>

      {!isLoading && enrichedItems.length === 0 && !search && !catId && !typeFilter && !lowStockOnly ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your first item to get started"
          action={{ label: 'Add Item', onClick: () => router.push('/catalog/items/new') }}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={enrichedItems}
            isLoading={isLoading}
            emptyMessage={lowStockOnly ? 'No low stock items' : 'No items match your filters'}
            onRowClick={(row) => openDrawer(row)}
            rowClassName={(row) => (!row.archivedAt ? '' : 'opacity-50')}
          />
          {hasMore && !lowStockOnly && (
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

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={!!deactivateTarget}
        title="Deactivate Item"
        description={`Are you sure you want to deactivate "${deactivateTarget?.name}"? It will no longer appear in POS, receiving, or active views.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={handleDeactivate}
        onClose={() => {
          setDeactivateTarget(null);
          setDeactivateReason('');
        }}
      >
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason (optional)
          </label>
          <textarea
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            rows={3}
            placeholder="e.g., Product discontinued by manufacturer"
          />
        </div>
      </ConfirmDialog>

      {/* Reactivate Confirmation */}
      <ConfirmDialog
        open={!!reactivateTarget}
        title="Reactivate Item"
        description={`Are you sure you want to reactivate "${reactivateTarget?.name}"? It will reappear in POS, receiving, and active views.`}
        confirmLabel="Reactivate"
        onConfirm={handleReactivate}
        onClose={() => setReactivateTarget(null)}
      />

      {/* Change History modal */}
      <ItemChangeLogModal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        itemId={historyItem?.id ?? ''}
        itemName={historyItem?.name ?? ''}
      />
    </div>
  );
}
