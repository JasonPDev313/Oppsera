'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star } from 'lucide-react';
import type { VendorCatalogEntry, VendorCatalogItemInput } from '@/types/vendors';

interface VendorCatalogEditDialogProps {
  entry: VendorCatalogEntry | null;
  onClose: () => void;
  onSubmit: (itemVendorId: string, input: Partial<VendorCatalogItemInput>) => Promise<void>;
  isSubmitting: boolean;
}

export function VendorCatalogEditDialog({
  entry,
  onClose,
  onSubmit,
  isSubmitting,
}: VendorCatalogEditDialogProps) {
  const [vendorSku, setVendorSku] = useState(entry?.vendorSku ?? '');
  const [vendorCost, setVendorCost] = useState(entry?.vendorCost != null ? String(entry.vendorCost) : '');
  const [leadTimeDays, setLeadTimeDays] = useState(entry?.leadTimeDays != null ? String(entry.leadTimeDays) : '');
  const [isPreferred, setIsPreferred] = useState(entry?.isPreferred ?? false);
  const [minOrderQty, setMinOrderQty] = useState(entry?.minOrderQty != null ? String(entry.minOrderQty) : '');
  const [packSize, setPackSize] = useState(entry?.packSize ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');

  if (!entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(entry.id, {
      vendorSku: vendorSku.trim() || null,
      vendorCost: vendorCost ? parseFloat(vendorCost) : null,
      leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : null,
      isPreferred,
      minOrderQty: minOrderQty ? parseFloat(minOrderQty) : null,
      packSize: packSize.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Edit Catalog Item</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-muted px-3 py-2">
          <span className="text-sm font-medium text-foreground">{entry.itemName}</span>
          {entry.itemSku && <span className="ml-2 text-xs text-muted-foreground">{entry.itemSku}</span>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Vendor SKU</span>
              <input
                type="text"
                value={vendorSku}
                onChange={(e) => setVendorSku(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Vendor Cost</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={vendorCost}
                onChange={(e) => setVendorCost(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Lead Time (days)</span>
              <input
                type="number"
                min="0"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Min Order Qty</span>
              <input
                type="number"
                min="1"
                step="any"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-foreground">Pack Size</span>
            <input
              type="text"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="e.g. Case of 24"
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPreferred}
              onChange={(e) => setIsPreferred(e.target.checked)}
              className="h-4 w-4 rounded border-input text-indigo-600 focus:ring-indigo-500"
            />
            <Star className={`h-4 w-4 ${isPreferred ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
            <span className="text-sm font-medium text-foreground">Preferred vendor for this item</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              rows={2}
            />
          </label>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
