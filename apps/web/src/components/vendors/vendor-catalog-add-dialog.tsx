'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Star } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { VendorCatalogItemInput } from '@/types/vendors';

interface InventoryItemSearchResult {
  id: string;
  name: string;
  sku: string | null;
}

interface VendorCatalogAddDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: VendorCatalogItemInput) => Promise<void>;
  isSubmitting: boolean;
}

export function VendorCatalogAddDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: VendorCatalogAddDialogProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<InventoryItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItemSearchResult | null>(null);
  const [vendorSku, setVendorSku] = useState('');
  const [vendorCost, setVendorCost] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [isPreferred, setIsPreferred] = useState(false);
  const [minOrderQty, setMinOrderQty] = useState('');
  const [packSize, setPackSize] = useState('');
  const [notes, setNotes] = useState('');

  // Search inventory items on query change
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams({ search: search, limit: '20' });
        const res = await apiFetch<{ data: InventoryItemSearchResult[] }>(
          `/api/v1/inventory?${params}`,
        );
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const resetForm = () => {
    setSearch('');
    setResults([]);
    setSelectedItem(null);
    setVendorSku('');
    setVendorCost('');
    setLeadTimeDays('');
    setIsPreferred(false);
    setMinOrderQty('');
    setPackSize('');
    setNotes('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    await onSubmit({
      inventoryItemId: selectedItem.id,
      vendorSku: vendorSku.trim() || null,
      vendorCost: vendorCost ? parseFloat(vendorCost) : null,
      leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : null,
      isPreferred,
      minOrderQty: minOrderQty ? parseFloat(minOrderQty) : null,
      packSize: packSize.trim() || null,
      notes: notes.trim() || null,
    });
    resetForm();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Catalog Item</h2>
          <button type="button" onClick={handleClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item selector */}
          {!selectedItem ? (
            <div>
              <label className="block text-sm font-medium text-gray-700">Inventory Item</label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items by name or SKU..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
              {isSearching && <p className="mt-1 text-xs text-gray-400">Searching...</p>}
              {results.length > 0 && (
                <ul className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200">
                  {results.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-900">{item.name}</span>
                        {item.sku && <span className="text-xs text-gray-400">{item.sku}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
              <div>
                <span className="text-sm font-medium text-indigo-900">{selectedItem.name}</span>
                {selectedItem.sku && <span className="ml-2 text-xs text-indigo-600">{selectedItem.sku}</span>}
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-indigo-400 hover:text-indigo-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Vendor-specific fields */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Vendor SKU</span>
              <input
                type="text"
                value={vendorSku}
                onChange={(e) => setVendorSku(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Vendor Cost</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={vendorCost}
                onChange={(e) => setVendorCost(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Lead Time (days)</span>
              <input
                type="number"
                min="0"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Min Order Qty</span>
              <input
                type="number"
                min="1"
                step="any"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Pack Size</span>
            <input
              type="text"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="e.g. Case of 24"
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPreferred}
              onChange={(e) => setIsPreferred(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <Star className={`h-4 w-4 ${isPreferred ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
            <span className="text-sm font-medium text-gray-700">Preferred vendor for this item</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              rows={2}
            />
          </label>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedItem || isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
