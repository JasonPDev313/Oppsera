'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';

import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { ReceiptStatusBadge } from '@/components/receiving/receipt-status-badge';
import { ReorderSuggestionsPanel } from '@/components/receiving/reorder-suggestions-panel';
import { useReceipts, useVendors, useReorderSuggestions } from '@/hooks/use-receiving';
import { apiFetch } from '@/lib/api-client';
import type { ReceiptSummary, ReceiptStatus } from '@/types/receiving';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'voided', label: 'Voided' },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

type ReceiptRow = ReceiptSummary & Record<string, unknown>;

export default function ReceivingContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { items, isLoading, hasMore, loadMore } = useReceipts({
    status: (statusFilter || undefined) as ReceiptStatus | undefined,
    vendorId: vendorFilter || undefined,
  });

  const { items: vendorList } = useVendors(undefined, { minimal: true });
  const { data: reorderSuggestions, isLoading: reorderLoading } = useReorderSuggestions(undefined);

  const vendorOptions = [
    { value: '', label: 'All Vendors' },
    ...vendorList.map((v) => ({ value: v.id, label: v.name })),
  ];

  const handleCreateReceipt = useCallback(async () => {
    if (vendorList.length === 0) {
      toast.error('Create a vendor first before creating a receipt');
      return;
    }
    try {
      setIsCreating(true);
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiFetch<{ data: { id: string } }>('/api/v1/inventory/receiving', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: vendorList[0]!.id,
          receivedDate: today,
        }),
      });
      router.push(`/inventory/receiving/${res.data.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create receipt');
    } finally {
      setIsCreating(false);
    }
  }, [vendorList, router, toast]);

  const columns = [
    {
      key: 'receiptNumber',
      header: 'Receipt #',
      render: (row: ReceiptRow) => (
        <span className="font-medium text-foreground">{row.receiptNumber}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: ReceiptRow) => <ReceiptStatusBadge status={row.status} />,
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      render: (row: ReceiptRow) => <span className="text-sm text-foreground">{row.vendorName}</span>,
    },
    {
      key: 'receivedDate',
      header: 'Date',
      render: (row: ReceiptRow) => <span className="text-sm text-muted-foreground">{row.receivedDate}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      render: (row: ReceiptRow) => (
        <span className="text-sm font-medium text-foreground">{formatMoney(row.total)}</span>
      ),
    },
    {
      key: 'vendorInvoiceNumber',
      header: 'Invoice #',
      render: (row: ReceiptRow) => (
        <span className="text-sm text-muted-foreground">{row.vendorInvoiceNumber ?? '\u2014'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Receiving</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Receive inventory from vendors with cost tracking
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateReceipt}
          disabled={isCreating}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {isCreating ? 'Creating...' : 'New Receipt'}
        </button>
      </div>

      {/* Reorder Suggestions */}
      <ReorderSuggestionsPanel
        suggestions={reorderSuggestions}
        isLoading={reorderLoading}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          placeholder="All Statuses"
          className="w-full md:w-40"
        />
        <Select
          options={vendorOptions}
          value={vendorFilter}
          onChange={(v) => setVendorFilter(v as string)}
          placeholder="All Vendors"
          className="w-full md:w-48"
        />
      </div>

      {/* Table */}
      {!isLoading && items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No receipts yet"
          description="Create your first receipt to start receiving inventory."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items as ReceiptRow[]}
            isLoading={isLoading}
            emptyMessage="No receipts match your filters"
            onRowClick={(row) => router.push(`/inventory/receiving/${row.id}`)}
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
