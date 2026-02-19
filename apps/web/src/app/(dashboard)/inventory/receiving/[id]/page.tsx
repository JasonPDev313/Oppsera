'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Ban } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { ReceiptStatusBadge } from '@/components/receiving/receipt-status-badge';
import { ReceiptTotalsBar } from '@/components/receiving/receipt-totals-bar';
import { ReceiptLineTable } from '@/components/receiving/receipt-line-table';
import { ItemSearchInput } from '@/components/receiving/item-search-input';
import { PostReceiptDialog } from '@/components/receiving/post-receipt-dialog';
import { VoidReceiptDialog } from '@/components/receiving/void-receipt-dialog';
import { useReceipt, useReceivingItemSearch, useVendors } from '@/hooks/use-receiving';
import { apiFetch } from '@/lib/api-client';
import type { ReceivingItemSearchResult, ReceiptStatus } from '@/types/receiving';
import { Select } from '@/components/ui/select';

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const receiptId = params.id as string;

  const { data: receipt, isLoading, error, mutate } = useReceipt(receiptId);
  const { items: vendorList } = useVendors();

  const search = useReceivingItemSearch(
    receipt?.locationId,
    receipt?.vendorId,
  );

  const [showPostDialog, setShowPostDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [removingLine, setRemovingLine] = useState<string | null>(null);

  const isDraft = receipt?.status === 'draft';

  // ── Header update ─────────────────────────────────────────────
  const handleHeaderUpdate = useCallback(async (updates: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/v1/inventory/receiving/${receiptId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      mutate();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update receipt');
    }
  }, [receiptId, mutate, toast]);

  // ── Add line from search ──────────────────────────────────────
  const handleAddItem = useCallback(async (item: ReceivingItemSearchResult) => {
    try {
      await apiFetch(`/api/v1/inventory/receiving/${receiptId}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: item.id,
          quantityReceived: 1,
          uomCode: item.baseUnit,
          unitCost: item.vendorCost ?? item.currentCost ?? 0,
        }),
      });
      mutate();
      toast.success(`Added ${item.name}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add item');
    }
  }, [receiptId, mutate, toast]);

  // ── Remove line ───────────────────────────────────────────────
  const handleRemoveLine = useCallback(async (lineId: string) => {
    try {
      setRemovingLine(lineId);
      await apiFetch(`/api/v1/inventory/receiving/${receiptId}/lines/${lineId}`, {
        method: 'DELETE',
      });
      mutate();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove line');
    } finally {
      setRemovingLine(null);
    }
  }, [receiptId, mutate, toast]);

  // ── Post receipt ──────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    try {
      setIsPosting(true);
      await apiFetch(`/api/v1/inventory/receiving/${receiptId}/post`, {
        method: 'POST',
      });
      toast.success('Receipt posted successfully');
      setShowPostDialog(false);
      mutate();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to post receipt');
    } finally {
      setIsPosting(false);
    }
  }, [receiptId, mutate, toast]);

  // ── Void receipt ──────────────────────────────────────────────
  const handleVoid = useCallback(async (reason: string) => {
    try {
      setIsVoiding(true);
      await apiFetch(`/api/v1/inventory/receiving/${receiptId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      toast.success('Receipt voided');
      setShowVoidDialog(false);
      mutate();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to void receipt');
    } finally {
      setIsVoiding(false);
    }
  }, [receiptId, mutate, toast]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => router.push('/inventory/receiving')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Receiving
        </button>
        <p className="text-red-500">{error ?? 'Receipt not found'}</p>
      </div>
    );
  }

  const vendorOptions = vendorList.map((v) => ({ value: v.id, label: v.name }));

  const allocationOptions = [
    { value: 'none', label: 'None' },
    { value: 'by_cost', label: 'By Cost' },
    { value: 'by_qty', label: 'By Quantity' },
    { value: 'by_weight', label: 'By Weight' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => router.push('/inventory/receiving')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{receipt.receiptNumber}</h1>
              <ReceiptStatusBadge status={receipt.status} />
            </div>
            <p className="text-sm text-gray-500">
              {receipt.vendorName} | {receipt.receivedDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDraft && receipt.lines.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPostDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <Send className="h-4 w-4" />
              Post Receipt
            </button>
          )}
          {receipt.status === 'posted' && (
            <button
              type="button"
              onClick={() => setShowVoidDialog(true)}
              className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Ban className="h-4 w-4" />
              Void
            </button>
          )}
        </div>
      </div>

      {/* Editable header fields (draft only) */}
      {isDraft && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-surface p-4 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Vendor</label>
            <Select
              options={vendorOptions}
              value={receipt.vendorId}
              onChange={(v) => handleHeaderUpdate({ vendorId: v })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Received Date</label>
            <input
              type="date"
              value={receipt.receivedDate}
              onChange={(e) => handleHeaderUpdate({ receivedDate: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Invoice #</label>
            <input
              type="text"
              value={receipt.vendorInvoiceNumber ?? ''}
              onChange={(e) => handleHeaderUpdate({ vendorInvoiceNumber: e.target.value || null })}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Shipping</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={receipt.shippingCost}
                onChange={(e) => handleHeaderUpdate({ shippingCost: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Allocation</label>
              <Select
                options={allocationOptions}
                value={receipt.shippingAllocationMethod}
                onChange={(v) => handleHeaderUpdate({ shippingAllocationMethod: v })}
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Item Search (draft only) */}
      {isDraft && (
        <ItemSearchInput
          results={search.results}
          query={search.query}
          onQueryChange={search.setQuery}
          isSearching={search.isSearching}
          onSelect={handleAddItem}
        />
      )}

      {/* Line Items */}
      <ReceiptLineTable
        lines={receipt.lines}
        isDraft={isDraft}
        onRemoveLine={isDraft ? handleRemoveLine : undefined}
        isRemoving={removingLine}
      />

      {/* Totals */}
      <ReceiptTotalsBar
        subtotal={receipt.subtotal}
        shippingCost={receipt.shippingCost}
        taxAmount={receipt.taxAmount}
        total={receipt.total}
      />

      {/* Dialogs */}
      <PostReceiptDialog
        open={showPostDialog}
        lineCount={receipt.lines.length}
        total={receipt.total}
        onConfirm={handlePost}
        onClose={() => setShowPostDialog(false)}
        isPosting={isPosting}
      />
      <VoidReceiptDialog
        open={showVoidDialog}
        onConfirm={handleVoid}
        onClose={() => setShowVoidDialog(false)}
        isVoiding={isVoiding}
      />
    </div>
  );
}
