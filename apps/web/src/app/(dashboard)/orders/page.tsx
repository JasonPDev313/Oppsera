'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useOrders } from '@/hooks/use-orders';
import type { Order } from '@/types/pos';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'placed', label: 'Placed' },
  { value: 'voided', label: 'Voided' },
];

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  open: { label: 'Open', variant: 'info' },
  placed: { label: 'Placed', variant: 'success' },
  voided: { label: 'Voided', variant: 'error' },
};

const SOURCE_BADGES: Record<string, { label: string; variant: string }> = {
  pos: { label: 'POS', variant: 'indigo' },
  online: { label: 'Online', variant: 'purple' },
  admin: { label: 'Admin', variant: 'neutral' },
  kiosk: { label: 'Kiosk', variant: 'orange' },
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type OrderRow = Order & Record<string, unknown>;

export default function OrdersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const { data: orders, isLoading, hasMore, loadMore } = useOrders({
    status: statusFilter || undefined,
    businessDate: dateFilter || undefined,
    search: search || undefined,
  });

  const columns = [
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (row: OrderRow) => (
        <span className="font-semibold text-gray-900">{row.orderNumber}</span>
      ),
    },
    {
      key: 'businessDate',
      header: 'Date',
      render: (row: OrderRow) => (
        <span className="text-gray-600">{formatDate(row.businessDate)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: OrderRow) => {
        const badge = STATUS_BADGES[row.status] || { label: row.status, variant: 'neutral' };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'items',
      header: 'Items',
      render: (row: OrderRow) => (
        <span className="text-gray-600">{row.lines?.length ?? '\u2014'}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      render: (row: OrderRow) => (
        <span className="font-medium text-gray-900">{formatMoney(row.total)}</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (row: OrderRow) => {
        const badge = SOURCE_BADGES[row.source] || { label: row.source, variant: 'neutral' };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'terminalId',
      header: 'Terminal',
      render: (row: OrderRow) => (
        <span className="text-gray-500">{row.terminalId || '\u2014'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Orders</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by order number..."
          className="w-full md:w-64"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          placeholder="All Statuses"
          className="w-full md:w-40"
        />
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        {dateFilter && (
          <button
            type="button"
            onClick={() => setDateFilter('')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear date
          </button>
        )}
      </div>

      {!isLoading && orders.length === 0 && !search && !statusFilter && !dateFilter ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders yet"
          description="Orders will appear here once they are created"
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={orders as OrderRow[]}
            isLoading={isLoading}
            emptyMessage="No orders match your filters"
            onRowClick={(row) => router.push(`/orders/${row.id}`)}
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
