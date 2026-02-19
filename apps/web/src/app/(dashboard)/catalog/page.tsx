'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Package, AlertTriangle, Eye, Archive, History } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useCatalogItems, useDepartments, useSubDepartments, useCategories } from '@/hooks/use-catalog';
import { useInventory } from '@/hooks/use-inventory';
import { apiFetch } from '@/lib/api-client';
import { getItemTypeGroup, ITEM_TYPE_BADGES } from '@/types/catalog';
import type { CatalogItemRow } from '@/types/catalog';

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
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [subDeptId, setSubDeptId] = useState('');
  const [catId, setCatId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<EnrichedRow | null>(null);

  const { data: departments } = useDepartments();
  const { data: subDepartments } = useSubDepartments(deptId || undefined);
  const { data: categories } = useCategories(subDeptId || undefined);

  const { data: items, isLoading, hasMore, loadMore } = useCatalogItems({
    categoryId: catId || undefined,
    itemType: typeToBackend[typeFilter],
    isActive: showInactive ? undefined : true,
    search: search || undefined,
  });

  // Fetch inventory data in parallel for stock columns
  const { data: inventoryItems, mutate: mutateInventory } = useInventory({
    search: search || undefined,
    itemType: typeToBackend[typeFilter],
    lowStockOnly,
  });

  // Build a lookup map: catalogItemId → inventory data
  const stockMap = useMemo(() => {
    const map = new Map<string, { onHand: number; reorderPoint: string | null; baseUnit: string; inventoryItemId: string; status: string }>();
    for (const inv of inventoryItems) {
      map.set(inv.catalogItemId, {
        onHand: inv.onHand,
        reorderPoint: inv.reorderPoint,
        baseUnit: inv.baseUnit,
        inventoryItemId: inv.id,
        status: inv.status,
      });
    }
    return map;
  }, [inventoryItems]);

  // When lowStockOnly is checked, filter to only items that appear in inventory low stock results
  const enrichedItems: EnrichedRow[] = useMemo(() => {
    const catalogRows = (items ?? []) as EnrichedRow[];
    const enriched = catalogRows.map((item) => {
      const stock = stockMap.get(item.id);
      return {
        ...item,
        onHand: stock?.onHand,
        reorderPoint: stock?.reorderPoint,
        baseUnit: stock?.baseUnit,
        inventoryItemId: stock?.inventoryItemId,
        inventoryStatus: stock?.status,
      };
    });
    if (lowStockOnly) {
      const lowStockCatalogIds = new Set(inventoryItems.map((inv) => inv.catalogItemId));
      return enriched.filter((item) => lowStockCatalogIds.has(item.id));
    }
    return enriched;
  }, [items, stockMap, lowStockOnly, inventoryItems]);

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

  const handleArchive = useCallback(
    async (item: EnrichedRow) => {
      if (!item.inventoryItemId) return;
      const isArchived = item.inventoryStatus === 'archived';
      try {
        await apiFetch(`/api/v1/inventory/${item.inventoryItemId}/archive`, {
          method: 'POST',
          body: JSON.stringify({ archive: !isArchived }),
        });
        toast.success(isArchived ? `"${item.name}" unarchived` : `"${item.name}" archived`);
        mutateInventory();
      } catch {
        toast.error(`Failed to ${isArchived ? 'unarchive' : 'archive'} item`);
      }
      setArchiveTarget(null);
    },
    [toast, mutateInventory],
  );

  const buildActions = useCallback(
    (row: EnrichedRow): ActionMenuItem[] => {
      const actions: ActionMenuItem[] = [
        {
          key: 'view',
          label: 'View / Edit',
          icon: Eye,
          onClick: () => router.push(`/catalog/items/${row.id}`),
        },
      ];
      if (row.inventoryItemId) {
        actions.push({
          key: 'changelog',
          label: 'Stock History',
          icon: History,
          onClick: () => router.push(`/inventory/${row.inventoryItemId}?tab=movements`),
        });
        const isArchived = row.inventoryStatus === 'archived';
        actions.push({
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
        });
      }
      return actions;
    },
    [router, handleArchive],
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
      key: 'isActive',
      header: 'Status',
      render: (row: EnrichedRow) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Inactive'}
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
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Show inactive
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
            onRowClick={(row) => router.push(`/catalog/items/${row.id}`)}
            rowClassName={(row) => (row.isActive ? '' : 'opacity-50')}
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
