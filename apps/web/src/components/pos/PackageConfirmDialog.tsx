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

function formatDollars(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
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
  const isSumMode = metadata.pricingMode === 'sum_of_components';

  const componentsSubtotal = useMemo(() => {
    if (!isSumMode) return null;
    return components.reduce(
      (sum, c) => sum + (c.componentUnitPrice ?? 0) * c.qty,
      0,
    );
  }, [components, isSumMode]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="package-confirm-dialog-title">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
          <div className="flex-1">
            <h3 id="package-confirm-dialog-title" className="text-lg font-semibold text-foreground">{item.name}</h3>
          </div>
          <span className="text-lg font-semibold text-foreground">{formatPrice(item.price)}</span>
          <button
            ref={firstFocusRef}
            type="button"
            onClick={onClose}
            className="ml-3 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="mb-3 text-sm font-medium text-foreground">This package includes:</p>

          {isSumMode && components.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-1 text-left font-medium">Item</th>
                  <th className="pb-1 text-right font-medium">Unit</th>
                  <th className="pb-1 text-right font-medium">Qty</th>
                  <th className="pb-1 text-right font-medium">Extended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {components.map((comp) => {
                  const unitPrice = comp.componentUnitPrice ?? 0;
                  const extended = unitPrice * comp.qty;
                  const subtotal = componentsSubtotal ?? 1;
                  const allocPct = subtotal > 0 ? Math.round((extended / subtotal) * 100) : 0;
                  const typeGroup = getItemTypeGroup(comp.itemType);
                  const badge = ITEM_TYPE_BADGES[typeGroup];

                  return (
                    <tr key={comp.catalogItemId}>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                          <span className="text-gray-900">{comp.itemName}</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">{formatDollars(unitPrice)}</td>
                      <td className="py-1.5 text-right text-gray-600">{comp.qty}</td>
                      <td className="py-1.5 text-right">
                        <span className="font-medium text-gray-900">{formatDollars(extended)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({allocPct}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={3} className="pt-2 text-sm font-medium text-foreground">Total</td>
                  <td className="pt-2 text-right text-base font-semibold text-foreground">
                    {formatDollars(componentsSubtotal ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <>
              <ul className="space-y-2">
                {components.map((comp) => {
                  const typeGroup = getItemTypeGroup(comp.itemType);
                  const badge = ITEM_TYPE_BADGES[typeGroup];

                  return (
                    <li
                      key={comp.catalogItemId}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">&bull;</span>
                        <span className="text-sm text-foreground">
                          {comp.itemName} ({comp.qty}x)
                        </span>
                      </div>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </li>
                  );
                })}
              </ul>

              {components.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No components listed.</p>
              )}

              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Package price:</span>
                  <span className="text-lg font-semibold text-foreground">{formatPrice(item.price)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
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
