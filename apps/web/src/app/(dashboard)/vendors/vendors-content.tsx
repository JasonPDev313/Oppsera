'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { VendorStatusBadge } from '@/components/vendors/vendor-status-badge';
import { useVendors } from '@/hooks/use-vendors';
import type { VendorSummary } from '@/types/vendors';

const statusOptions = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
  { value: '', label: 'All' },
];

type VendorRow = VendorSummary & Record<string, unknown>;

export default function VendorsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('true');

  const { items, isLoading, hasMore, loadMore } = useVendors({
    search: search || undefined,
    isActive: statusFilter === '' ? undefined : statusFilter === 'true',
  });

  const columns = [
    {
      key: 'name',
      header: 'Vendor Name',
      render: (row: VendorRow) => (
        <span className="font-medium text-foreground">{row.name}</span>
      ),
    },
    {
      key: 'accountNumber',
      header: 'Account #',
      render: (row: VendorRow) => (
        <span className="text-sm text-muted-foreground">{row.accountNumber ?? '\u2014'}</span>
      ),
    },
    {
      key: 'contactName',
      header: 'Contact',
      render: (row: VendorRow) => (
        <div>
          <span className="text-sm text-foreground">{row.contactName ?? '\u2014'}</span>
          {row.contactEmail && (
            <span className="ml-2 text-xs text-muted-foreground">{row.contactEmail}</span>
          )}
        </div>
      ),
    },
    {
      key: 'itemCount',
      header: 'Items',
      render: (row: VendorRow) => (
        <span className="text-sm text-foreground">{row.itemCount}</span>
      ),
    },
    {
      key: 'lastReceiptDate',
      header: 'Last Receipt',
      render: (row: VendorRow) => (
        <span className="text-sm text-muted-foreground">{row.lastReceiptDate ?? 'Never'}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: VendorRow) => <VendorStatusBadge isActive={row.isActive} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Vendors</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your suppliers and vendor catalogs
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/vendors/new')}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Vendor
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          onChange={setSearch}
          placeholder="Search vendors..."
          className="w-full sm:w-64"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          placeholder="Status"
          className="w-full sm:w-36"
        />
      </div>

      {/* Table */}
      {!isLoading && items.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No vendors yet"
          description="Add your first vendor to start tracking supplier relationships."
          action={{ label: 'New Vendor', onClick: () => router.push('/vendors/new') }}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items as VendorRow[]}
            isLoading={isLoading}
            emptyMessage="No vendors match your filters"
            onRowClick={(row) => router.push(`/vendors/${row.id}`)}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
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
