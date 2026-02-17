'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getItemTypeGroup } from '@oppsera/shared';
import { ITEM_TYPE_BADGES } from '@/types/catalog';
import type { CatalogItemForPOS, AddLineItemInput } from '@/types/pos';
import type { PackageMetadata } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────

interface PackageConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  item: CatalogItemForPOS | null;
  onAdd: (input: AddLineItemInput) => void;
}

export function PackageConfirmDialog({ open, onClose, item, onAdd }: PackageConfirmDialogProps) {
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // ── Parse metadata ────────────────────────────────────────────

  const metadata = useMemo<PackageMetadata>(() => {
    if (!item) return { isPackage: true };
    return (item.metadata as unknown as PackageMetadata) ?? { isPackage: true };
  }, [item]);

  const components = useMemo(() => metadata.packageComponents ?? [], [metadata]);

  // ── Keyboard & focus ──────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      firstFocusRef.current?.focus();
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  // ── Handler ───────────────────────────────────────────────────

  function handleAdd() {
    if (!item) return;

    const input: AddLineItemInput = {
      catalogItemId: item.id,
      qty: 1,
    };

    onAdd(input);
  }

  // ── Render ────────────────────────────────────────────────────

  if (!open || !item || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
          </div>
          <span className="text-lg font-semibold text-gray-900">{formatPrice(item.price)}</span>
          <button
            ref={firstFocusRef}
            type="button"
            onClick={onClose}
            className="ml-3 rounded-md p-1 text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="mb-3 text-sm font-medium text-gray-700">This package includes:</p>

          <ul className="space-y-2">
            {components.map((comp) => {
              const typeGroup = getItemTypeGroup(comp.itemType);
              const badge = ITEM_TYPE_BADGES[typeGroup];

              return (
                <li
                  key={comp.catalogItemId}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">&bull;</span>
                    <span className="text-sm text-gray-900">
                      {comp.itemName} ({comp.qty}x)
                    </span>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </li>
              );
            })}
          </ul>

          {components.length === 0 && (
            <p className="text-sm text-gray-400 italic">No components listed.</p>
          )}

          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Package price:</span>
              <span className="text-lg font-semibold text-gray-900">{formatPrice(item.price)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Add to Order
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
