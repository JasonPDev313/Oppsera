'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useCatalogItems, useDepartments, useSubDepartments, useCategories } from '@/hooks/use-catalog';
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

export default function CatalogPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [subDeptId, setSubDeptId] = useState('');
  const [catId, setCatId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { data: departments } = useDepartments();
  const { data: subDepartments } = useSubDepartments(deptId || undefined);
  const { data: categories } = useCategories(subDeptId || undefined);

  const { data: items, isLoading, hasMore, loadMore } = useCatalogItems({
    categoryId: catId || undefined,
    itemType: typeToBackend[typeFilter],
    isActive: showInactive ? undefined : true,
    search: search || undefined,
  });

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

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: CatalogItemRow & Record<string, unknown>) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      render: (row: CatalogItemRow & Record<string, unknown>) => (
        <span className="font-mono text-gray-500">{row.sku || '-'}</span>
      ),
    },
    {
      key: 'itemType',
      header: 'Type',
      render: (row: CatalogItemRow & Record<string, unknown>) => {
        const group = getItemTypeGroup(row.itemType, row.metadata);
        const badge = ITEM_TYPE_BADGES[group];
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'defaultPrice',
      header: 'Price',
      render: (row: CatalogItemRow & Record<string, unknown>) => formatPrice(row.defaultPrice),
    },
    {
      key: 'departmentName',
      header: 'Department',
      render: (row: CatalogItemRow & Record<string, unknown>) => (
        <span className="text-gray-500">{row.departmentName || '-'}</span>
      ),
    },
    {
      key: 'subDepartmentName',
      header: 'Sub-Dept',
      render: (row: CatalogItemRow & Record<string, unknown>) => (
        <span className="text-gray-500">{row.subDepartmentName || '-'}</span>
      ),
    },
    {
      key: 'categoryName',
      header: 'Category',
      render: (row: CatalogItemRow & Record<string, unknown>) => (
        <span className="text-gray-500">{row.categoryName || '-'}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: CatalogItemRow & Record<string, unknown>) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Catalog</h1>
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
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Show inactive
        </label>
      </div>

      {!isLoading && (items ?? []).length === 0 && !search && !catId && !typeFilter ? (
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
            data={items as (CatalogItemRow & Record<string, unknown>)[]}
            isLoading={isLoading}
            emptyMessage="No items match your filters"
            onRowClick={(row) => router.push(`/catalog/items/${row.id}`)}
            rowClassName={(row) => (row.isActive ? '' : 'opacity-50')}
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
    </div>
  );
}
