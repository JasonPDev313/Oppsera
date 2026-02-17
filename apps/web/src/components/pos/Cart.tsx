'use client';

import { useCallback } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getItemTypeGroup } from '@/types/catalog';
import type { Order, OrderLine } from '@/types/pos';
import type { FnbMetadata } from '@oppsera/shared';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Type-specific line renderers ──────────────────────────────────

interface LineRendererProps {
  line: OrderLine;
  onRemove: (lineId: string) => void;
  onUpdateQty?: (lineId: string, newQty: number) => void;
}

function FnbLineItem({ line, onRemove, onUpdateQty }: LineRendererProps) {
  const meta = (line as unknown as { metadata?: FnbMetadata }).metadata;
  const allowedFractions = meta?.allowedFractions ?? [1];

  const handleIncrement = useCallback(() => {
    if (!onUpdateQty) return;
    // Find next fraction step above current qty
    const currentIdx = allowedFractions.indexOf(line.qty);
    if (currentIdx >= 0 && currentIdx < allowedFractions.length - 1) {
      onUpdateQty(line.id, allowedFractions[currentIdx + 1]!);
    } else {
      onUpdateQty(line.id, line.qty + 1);
    }
  }, [line.id, line.qty, allowedFractions, onUpdateQty]);

  const handleDecrement = useCallback(() => {
    if (!onUpdateQty) return;
    const currentIdx = allowedFractions.indexOf(line.qty);
    if (currentIdx > 0) {
      onUpdateQty(line.id, allowedFractions[currentIdx - 1]!);
    } else if (line.qty > 1) {
      onUpdateQty(line.id, line.qty - 1);
    }
  }, [line.id, line.qty, allowedFractions, onUpdateQty]);

  const qtyDisplay = line.qty !== 1 ? ` (x${line.qty})` : '';

  return (
    <div className="group flex flex-col gap-1 border-b border-gray-100 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-900 truncate">
              {line.catalogItemName}
            </span>
            {qtyDisplay && (
              <span className="text-xs text-gray-500">{qtyDisplay}</span>
            )}
          </div>

          {/* Price override */}
          {line.originalUnitPrice !== null && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-xs text-gray-400 line-through">
                {formatMoney(line.originalUnitPrice)}
              </span>
              <span className="text-xs font-medium text-gray-700">
                {formatMoney(line.unitPrice)}
              </span>
              {line.priceOverrideReason && (
                <Badge variant="warning" className="text-[10px]">
                  {line.priceOverrideReason}
                </Badge>
              )}
            </div>
          )}

          {/* Modifiers */}
          {line.modifiers && line.modifiers.length > 0 && (
            <div className="mt-1 space-y-0.5 pl-3">
              {line.modifiers.map((mod) => (
                <div
                  key={mod.modifierId}
                  className="text-xs text-gray-500"
                >
                  {mod.name}
                  {mod.priceAdjustment !== 0 && (
                    <span className="ml-1 text-gray-400">
                      +{formatMoney(mod.priceAdjustment)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Special instructions */}
          {line.specialInstructions && (
            <p className="mt-1 text-xs italic text-amber-600">
              &ldquo;{line.specialInstructions}&rdquo;
            </p>
          )}

          {/* Notes */}
          {line.notes && (
            <p className="mt-0.5 text-xs text-gray-400">{line.notes}</p>
          )}
        </div>

        {/* Right side: total + remove */}
        <div className="flex items-start gap-1 shrink-0">
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-900">
              {formatMoney(line.lineTotal)}
            </div>
            {line.lineTax > 0 && (
              <div className="text-[10px] text-gray-400">
                tax {formatMoney(line.lineTax)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            className="rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label={`Remove ${line.catalogItemName}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Qty +/- controls */}
      {onUpdateQty && (
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={line.qty <= (allowedFractions[0] ?? 1)}
            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[2rem] text-center text-sm font-medium text-gray-700">
            {line.qty}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 transition-colors hover:bg-gray-100"
            aria-label="Increase quantity"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function RetailLineItem({ line, onRemove }: Omit<LineRendererProps, 'onUpdateQty'>) {
  return (
    <div className="group flex items-start justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-900 truncate block">
          {line.catalogItemName}
        </span>

        {/* Price override */}
        {line.originalUnitPrice !== null && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs text-gray-400 line-through">
              {formatMoney(line.originalUnitPrice)}
            </span>
            <span className="text-xs font-medium text-gray-700">
              {formatMoney(line.unitPrice)}
            </span>
            {line.priceOverrideReason && (
              <Badge variant="warning" className="text-[10px]">
                {line.priceOverrideReason}
              </Badge>
            )}
          </div>
        )}

        {/* Selected options (e.g., Size: L, Color: Navy) */}
        {line.selectedOptions && Object.keys(line.selectedOptions).length > 0 && (
          <p className="mt-0.5 text-xs text-gray-500">
            {Object.entries(line.selectedOptions)
              .map(([key, val]) => `${key}: ${val}`)
              .join(' \u00B7 ')}
          </p>
        )}

        {/* Notes */}
        {line.notes && (
          <p className="mt-0.5 text-xs text-gray-400">{line.notes}</p>
        )}
      </div>

      <div className="flex items-start gap-1 shrink-0">
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-900">
            {formatMoney(line.lineTotal)}
          </div>
          {line.lineTax > 0 && (
            <div className="text-[10px] text-gray-400">
              tax {formatMoney(line.lineTax)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.id)}
          className="rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label={`Remove ${line.catalogItemName}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ServiceLineItem({ line, onRemove }: Omit<LineRendererProps, 'onUpdateQty'>) {
  const durationMinutes = (line as unknown as { metadata?: { durationMinutes?: number } }).metadata?.durationMinutes;

  return (
    <div className="group flex items-start justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-900 truncate block">
          {line.catalogItemName}
        </span>
        {durationMinutes && (
          <p className="mt-0.5 text-xs text-gray-500">
            {durationMinutes} min
          </p>
        )}

        {/* Price override */}
        {line.originalUnitPrice !== null && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs text-gray-400 line-through">
              {formatMoney(line.originalUnitPrice)}
            </span>
            <span className="text-xs font-medium text-gray-700">
              {formatMoney(line.unitPrice)}
            </span>
            {line.priceOverrideReason && (
              <Badge variant="warning" className="text-[10px]">
                {line.priceOverrideReason}
              </Badge>
            )}
          </div>
        )}

        {/* Notes */}
        {line.notes && (
          <p className="mt-0.5 text-xs text-gray-400">{line.notes}</p>
        )}
      </div>

      <div className="flex items-start gap-1 shrink-0">
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-900">
            {formatMoney(line.lineTotal)}
          </div>
          {line.lineTax > 0 && (
            <div className="text-[10px] text-gray-400">
              tax {formatMoney(line.lineTax)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.id)}
          className="rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label={`Remove ${line.catalogItemName}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PackageLineItem({ line, onRemove }: Omit<LineRendererProps, 'onUpdateQty'>) {
  return (
    <div className="group flex items-start justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-900 truncate block">
          {line.catalogItemName}
        </span>

        {/* Price override */}
        {line.originalUnitPrice !== null && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs text-gray-400 line-through">
              {formatMoney(line.originalUnitPrice)}
            </span>
            <span className="text-xs font-medium text-gray-700">
              {formatMoney(line.unitPrice)}
            </span>
            {line.priceOverrideReason && (
              <Badge variant="warning" className="text-[10px]">
                {line.priceOverrideReason}
              </Badge>
            )}
          </div>
        )}

        {/* Package components */}
        {line.packageComponents && line.packageComponents.length > 0 && (
          <p className="mt-0.5 text-xs text-gray-500">
            Includes:{' '}
            {line.packageComponents
              .map((c) => c.itemName)
              .join(', ')}
          </p>
        )}

        {/* Notes */}
        {line.notes && (
          <p className="mt-0.5 text-xs text-gray-400">{line.notes}</p>
        )}
      </div>

      <div className="flex items-start gap-1 shrink-0">
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-900">
            {formatMoney(line.lineTotal)}
          </div>
          {line.lineTax > 0 && (
            <div className="text-[10px] text-gray-400">
              tax {formatMoney(line.lineTax)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.id)}
          className="rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label={`Remove ${line.catalogItemName}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Cart Component ────────────────────────────────────────────────

interface CartProps {
  order: Order | null;
  onRemoveItem: (lineId: string) => void;
  onUpdateQty?: (lineId: string, newQty: number) => void;
  label?: string;
}

function CartLineItem({ line, onRemoveItem, onUpdateQty }: {
  line: OrderLine;
  onRemoveItem: (lineId: string) => void;
  onUpdateQty?: (lineId: string, newQty: number) => void;
}) {
  const typeGroup = getItemTypeGroup(line.itemType);

  switch (typeGroup) {
    case 'fnb':
      return (
        <FnbLineItem
          line={line}
          onRemove={onRemoveItem}
          onUpdateQty={onUpdateQty}
        />
      );
    case 'retail':
      return <RetailLineItem line={line} onRemove={onRemoveItem} />;
    case 'service':
      return <ServiceLineItem line={line} onRemove={onRemoveItem} />;
    case 'package':
      return <PackageLineItem line={line} onRemove={onRemoveItem} />;
    default:
      return <RetailLineItem line={line} onRemove={onRemoveItem} />;
  }
}

export function Cart({
  order,
  onRemoveItem,
  onUpdateQty,
  label = 'Cart',
}: CartProps) {
  const lines = order?.lines ?? [];
  const itemCount = lines.length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
        <span className="text-xs text-gray-500">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Lines */}
      {itemCount === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-400">No items yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {lines
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((line) => (
              <CartLineItem
                key={line.id}
                line={line}
                onRemoveItem={onRemoveItem}
                onUpdateQty={onUpdateQty}
              />
            ))}
        </div>
      )}
    </div>
  );
}
