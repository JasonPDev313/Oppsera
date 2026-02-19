'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { ReceiptHeader } from '@/components/receiving/receipt-header';
import { ReceivingGrid } from '@/components/receiving/receiving-grid';
import { ReceiptTotalsBar } from '@/components/receiving/receipt-totals-bar';
import { ItemSearchInput } from '@/components/receiving/item-search-input';
import { PostReceiptDialog } from '@/components/receiving/post-receipt-dialog';
import { VoidReceiptDialog } from '@/components/receiving/void-receipt-dialog';
import { useReceivingEditor } from '@/hooks/use-receiving-editor';
import { useReceivingItemSearch, useVendors } from '@/hooks/use-receiving';
import type { ReceivingItemSearchResult } from '@/types/receiving';

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const receiptId = params.id as string;

  const editor = useReceivingEditor(receiptId);
  const { items: vendorList } = useVendors();

  const search = useReceivingItemSearch(
    editor.receipt?.locationId,
    editor.receipt?.vendorId,
  );

  const [showPostDialog, setShowPostDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);

  const isDraft = editor.receipt?.status === 'draft';
  const canPost = isDraft && editor.gridData.lines.length > 0;

  // ── Add item from search ──────────────────────────────────────

  const handleAddItem = useCallback(
    async (item: ReceivingItemSearchResult) => {
      const newLineId = await editor.addItem(item);
      if (newLineId) {
        toast.success(`Added ${item.name}`);
        // Invalidate search cache since inventory state changed
        search.clearCache();
      } else {
        toast.error('Failed to add item');
      }
    },
    [editor, toast, search],
  );

  // ── Post receipt ──────────────────────────────────────────────

  const handlePost = useCallback(async () => {
    const success = await editor.postReceipt();
    if (success) {
      toast.success('Receipt posted successfully');
      setShowPostDialog(false);
    } else {
      toast.error('Failed to post receipt');
    }
  }, [editor, toast]);

  // ── Void receipt ──────────────────────────────────────────────

  const handleVoid = useCallback(
    async (reason: string) => {
      const success = await editor.voidReceipt(reason);
      if (success) {
        toast.success('Receipt voided');
        setShowVoidDialog(false);
      } else {
        toast.error('Failed to void receipt');
      }
    },
    [editor, toast],
  );

  // ── Loading state ─────────────────────────────────────────────

  if (editor.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  if (editor.error || !editor.receipt) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push('/inventory/receiving')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          Back to Receiving
        </button>
        <p className="text-red-500">{editor.error ?? 'Receipt not found'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header: receipt info, status, actions, editable fields */}
      <ReceiptHeader
        receipt={editor.receipt}
        vendors={vendorList}
        onBack={() => router.push('/inventory/receiving')}
        onHeaderChange={editor.updateHeader}
        onPost={() => setShowPostDialog(true)}
        onVoid={() => setShowVoidDialog(true)}
        canPost={canPost}
        onAddCharge={editor.addCharge}
        onUpdateCharge={editor.updateCharge}
        onRemoveCharge={editor.removeCharge}
      />

      {/* Item search (draft only) */}
      {isDraft && (
        <ItemSearchInput
          results={search.results}
          query={search.query}
          onQueryChange={search.setQuery}
          isSearching={search.isSearching}
          onSelect={handleAddItem}
        />
      )}

      {/* Spreadsheet grid */}
      <ReceivingGrid
        lines={editor.gridData.lines}
        totals={editor.gridData.totals}
        isDraft={isDraft}
        onUpdateLine={editor.updateLine}
        onRemoveLine={isDraft ? editor.removeLine : undefined}
        removingLineId={editor.removingLineId}
        freightMode={editor.receipt.freightMode}
      />

      {/* Sticky totals footer */}
      <ReceiptTotalsBar totals={editor.gridData.totals} freightMode={editor.receipt.freightMode} />

      {/* Dialogs */}
      <PostReceiptDialog
        open={showPostDialog}
        lineCount={editor.gridData.lines.length}
        total={editor.gridData.totals.invoiceTotal}
        onConfirm={handlePost}
        onClose={() => setShowPostDialog(false)}
        isPosting={editor.isPosting}
      />
      <VoidReceiptDialog
        open={showVoidDialog}
        onConfirm={handleVoid}
        onClose={() => setShowVoidDialog(false)}
        isVoiding={editor.isVoiding}
      />
    </div>
  );
}
