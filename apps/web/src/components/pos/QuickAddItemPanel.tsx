'use client';

import { useState, useCallback } from 'react';
import { PackagePlus, Loader2, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface QuickAddItemPanelProps {
  onItemCreated: () => void;
}

const ITEM_TYPES = [
  { value: 'retail', label: 'Retail' },
  { value: 'food', label: 'Food' },
  { value: 'beverage', label: 'Beverage' },
  { value: 'service', label: 'Service' },
  { value: 'green_fee', label: 'Green Fee' },
  { value: 'rental', label: 'Rental' },
] as const;

export function QuickAddItemPanel({ onItemCreated }: QuickAddItemPanelProps) {
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<string>('retail');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cost, setCost] = useState('');
  const [isTrackable, setIsTrackable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName('');
    setDefaultPrice('');
    setSku('');
    setBarcode('');
    setCost('');
    setIsTrackable(false);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccessMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Item name is required');
      return;
    }

    const price = parseFloat(defaultPrice);
    if (isNaN(price) || price <= 0) {
      setError('Valid price is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: trimmedName,
        itemType,
        defaultPrice: Math.round(price * 100) / 100,
        isTrackable,
      };
      if (sku.trim()) body.sku = sku.trim();
      if (barcode.trim()) body.barcode = barcode.trim();
      const costVal = parseFloat(cost);
      if (!isNaN(costVal) && costVal >= 0) body.cost = Math.round(costVal * 100) / 100;

      await apiFetch('/api/v1/catalog/items', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setSuccessMessage(`"${trimmedName}" created`);
      resetForm();
      onItemCreated();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create item';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [name, itemType, defaultPrice, sku, barcode, cost, isTrackable, resetForm, onItemCreated]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4.5 w-4.5 text-indigo-500" />
          <h3 className="text-sm font-semibold text-foreground">Quick Add Item</h3>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          Create a new catalog item from the register
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-md space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="qai-name" className="mb-1 block text-xs font-medium text-foreground">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              id="qai-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diet Coke"
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              autoFocus
            />
          </div>

          {/* Item Type + Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qai-type" className="mb-1 block text-xs font-medium text-foreground">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                id="qai-type"
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qai-price" className="mb-1 block text-xs font-medium text-foreground">
                Price <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                <input
                  id="qai-price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 bg-surface py-2 pl-7 pr-3 text-sm text-right placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>

          {/* SKU + Barcode row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qai-sku" className="mb-1 block text-xs font-medium text-foreground">SKU</label>
              <input
                id="qai-sku"
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label htmlFor="qai-barcode" className="mb-1 block text-xs font-medium text-foreground">Barcode</label>
              <input
                id="qai-barcode"
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Cost */}
          <div>
            <label htmlFor="qai-cost" className="mb-1 block text-xs font-medium text-foreground">Cost</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
              <input
                id="qai-cost"
                type="number"
                step="0.01"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 bg-surface py-2 pl-7 pr-3 text-sm text-right placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Track Inventory toggle */}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
            <input
              type="checkbox"
              checked={isTrackable}
              onChange={(e) => setIsTrackable(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-foreground">Track Inventory</span>
              <p className="text-xs text-gray-500">Enable stock tracking for this item</p>
            </div>
          </label>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">
              <Check className="h-4 w-4 shrink-0" />
              {successMessage}
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || !defaultPrice}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </span>
            ) : (
              'Create Item'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
