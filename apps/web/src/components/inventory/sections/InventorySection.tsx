'use client';

import { useState, useCallback } from 'react';
import { Barcode, Plus, Minus } from 'lucide-react';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { InventoryIndicator } from '@/components/pos/InventoryIndicator';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { ItemFormState } from '../ItemEditDrawer';
import type { InventoryItem } from '@/types/inventory';

/** Generate a random EAN-13 barcode with valid check digit */
function generateEAN13(): string {
  // Start with 2 (internal use prefix per GS1)
  let digits = '2';
  for (let i = 0; i < 11; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i]!, 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return digits + check.toString();
}

interface InventorySectionProps {
  form: ItemFormState;
  onUpdate: (updates: Partial<ItemFormState>) => void;
  inventoryData: InventoryItem | null;
  inventoryItemId?: string | null;
}

export function InventorySection({ form, onUpdate, inventoryData, inventoryItemId }: InventorySectionProps) {
  const { toast } = useToast();
  const [adjustQty, setAdjustQty] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const allowNegative = !!form.metadata?.allowNegative;

  const handleGenerateBarcode = useCallback(() => {
    const barcode = generateEAN13();
    onUpdate({ barcode });
    toast.success(`Generated barcode: ${barcode}`);
  }, [onUpdate, toast]);

  const handleAdjustQty = useCallback(async (direction: 'add' | 'remove') => {
    const qty = parseInt(adjustQty, 10);
    if (!qty || qty <= 0 || !inventoryItemId) return;

    setAdjusting(true);
    try {
      const delta = direction === 'add' ? qty : -qty;
      await apiFetch(`/api/v1/inventory/${inventoryItemId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          quantityDelta: delta,
          reason: direction === 'add' ? `Quick receive: +${qty}` : `Quick remove: -${qty}`,
          movementType: 'adjustment',
        }),
      });
      toast.success(`${direction === 'add' ? 'Added' : 'Removed'} ${qty} units`);
      setAdjustQty('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Adjustment failed';
      toast.error(msg);
    } finally {
      setAdjusting(false);
    }
  }, [adjustQty, inventoryItemId, toast]);

  return (
    <CollapsibleSection id="inventory" title="Inventory">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* SKU */}
          <div>
            <label htmlFor="edit-sku" className="mb-1 block text-xs font-medium text-gray-700">
              SKU / PLU Code
            </label>
            <input
              id="edit-sku"
              type="text"
              value={form.sku}
              onChange={(e) => onUpdate({ sku: e.target.value })}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Barcode with generate button */}
          <div>
            <label htmlFor="edit-barcode" className="mb-1 block text-xs font-medium text-gray-700">
              Barcode
            </label>
            <div className="flex gap-1.5">
              <input
                id="edit-barcode"
                type="text"
                value={form.barcode}
                onChange={(e) => onUpdate({ barcode: e.target.value })}
                placeholder="Scan or enter"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={handleGenerateBarcode}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                title="Generate unique barcode"
              >
                <Barcode className="h-3.5 w-3.5" />
                Gen
              </button>
            </div>
          </div>
        </div>

        {/* Track Inventory toggle */}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
          <input
            type="checkbox"
            checked={form.isTrackable}
            onChange={(e) => onUpdate({ isTrackable: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-700">Track Inventory</span>
            <p className="text-xs text-gray-500">Enable stock level tracking for this item</p>
          </div>
        </label>

        {/* Allow Negative Quantity override */}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
          <input
            type="checkbox"
            checked={allowNegative}
            onChange={(e) => onUpdate({
              metadata: { ...form.metadata, allowNegative: e.target.checked },
            })}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-700">Allow Negative Quantity</span>
            <p className="text-xs text-gray-500">Override register settings to sell this item into negative stock</p>
          </div>
        </label>

        {/* Stock display (read-only) */}
        {inventoryData && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">On Hand</p>
                <div className="mt-0.5 flex items-center justify-center gap-1.5">
                  <span className="text-lg font-semibold text-gray-900">
                    {inventoryData.onHand ?? 0}
                  </span>
                  <InventoryIndicator
                    onHand={inventoryData.onHand ?? null}
                    isTrackInventory={form.isTrackable}
                    compact
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Reorder Pt</p>
                <p className="mt-0.5 text-lg font-semibold text-gray-900">
                  {inventoryData.reorderPoint ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Par Level</p>
                <p className="mt-0.5 text-lg font-semibold text-gray-900">
                  {inventoryData.parLevel ?? '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Quantity Adjust */}
        {inventoryItemId && form.isTrackable && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-700">Quick Quantity Adjust</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => handleAdjustQty('remove')}
                disabled={adjusting || !adjustQty || parseInt(adjustQty, 10) <= 0}
                className="flex shrink-0 items-center justify-center rounded-lg border border-red-300 px-2.5 py-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Remove quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="Qty"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-surface px-3 py-2 text-center text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => handleAdjustQty('add')}
                disabled={adjusting || !adjustQty || parseInt(adjustQty, 10) <= 0}
                className="flex shrink-0 items-center justify-center rounded-lg border border-green-300 px-2.5 py-2 text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Add quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Add or remove stock directly from the register
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
