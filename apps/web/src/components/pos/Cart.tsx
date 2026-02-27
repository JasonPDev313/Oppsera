'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Minus,
  Pencil,
  CheckSquare,
  Trash2,
  DollarSign,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getItemTypeGroup } from '@/types/catalog';
import type { Order, OrderLine } from '@/types/pos';
import type { FnbMetadata } from '@oppsera/shared';
import { LineItemEditPanel } from './LineItemEditPanel';
import type { LineEditPermissions } from './LineItemEditPanel';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Type-specific line renderers ──────────────────────────────────

interface LineRendererProps {
  line: OrderLine;
  onRemove: (lineId: string) => void;
  onUpdateQty?: (lineId: string, newQty: number) => void;
}

function formatQty(qty: number): string {
  return qty % 1 === 0 ? String(qty) : String(parseFloat(qty.toFixed(4)));
}

function FnbLineItem({ line, onRemove, onUpdateQty }: LineRendererProps) {
  const meta = (line as unknown as { metadata?: FnbMetadata }).metadata;
  const allowedFractions = meta?.allowedFractions ?? [1];
  const qty = Number(line.qty);

  const handleIncrement = useCallback(() => {
    if (!onUpdateQty) return;
    const currentIdx = allowedFractions.indexOf(qty);
    if (currentIdx >= 0 && currentIdx < allowedFractions.length - 1) {
      onUpdateQty(line.id, allowedFractions[currentIdx + 1]!);
    } else {
      onUpdateQty(line.id, qty + 1);
    }
  }, [line.id, qty, allowedFractions, onUpdateQty]);

  const handleDecrement = useCallback(() => {
    if (!onUpdateQty) return;
    const currentIdx = allowedFractions.indexOf(qty);
    if (currentIdx > 0) {
      onUpdateQty(line.id, allowedFractions[currentIdx - 1]!);
    } else if (qty > 1) {
      onUpdateQty(line.id, qty - 1);
    }
  }, [line.id, qty, allowedFractions, onUpdateQty]);

  const qtyDisplay = qty !== 1 ? ` (x${formatQty(qty)})` : '';

  return (
    <div className="group flex flex-col border-b border-border px-3 py-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="font-medium text-foreground truncate"
              style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
            >
              {line.catalogItemName}
            </span>
            {qtyDisplay && (
              <span className="text-xs text-muted-foreground">{qtyDisplay}</span>
            )}
          </div>

          {/* Price override */}
          {line.originalUnitPrice != null && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground line-through">
                {formatMoney(line.originalUnitPrice)}
              </span>
              <span className="text-xs font-medium text-foreground">
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
                  className="text-xs text-muted-foreground"
                >
                  {mod.name}
                  {mod.priceAdjustment !== 0 && (
                    <span className="ml-1 text-muted-foreground">
                      +{formatMoney(mod.priceAdjustment)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Special instructions */}
          {line.specialInstructions && (
            <p className="mt-1 text-xs italic text-amber-500">
              &ldquo;{line.specialInstructions}&rdquo;
            </p>
          )}

          {/* Notes */}
          {line.notes && (
            <p className="mt-0.5 text-xs text-muted-foreground">{line.notes}</p>
          )}
        </div>

        {/* Right side: total + remove */}
        <div className="flex items-start gap-1 shrink-0">
          <div className="text-right">
            <div
              className="text-sm font-semibold text-foreground"
              style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
            >
              {formatMoney(line.lineTotal)}
            </div>
            {line.lineTax > 0 && (
              <div className="text-[10px] text-muted-foreground">
                tax {formatMoney(line.lineTax)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
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
            disabled={qty <= (allowedFractions[0] ?? 1)}
            className="flex h-6 w-6 items-center justify-center rounded border border-input text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-8 text-center text-sm font-medium text-foreground">
            {formatQty(qty)}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            className="flex h-6 w-6 items-center justify-center rounded border border-input text-muted-foreground transition-colors hover:bg-accent"
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
    <div className="group flex items-start justify-between gap-2 border-b border-border px-3 py-0.5">
      <div className="flex-1 min-w-0">
        <span
          className="font-medium text-foreground truncate block"
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
        >
          {line.catalogItemName}
        </span>

        {/* Price override */}
        {line.originalUnitPrice != null && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(line.originalUnitPrice)}
            </span>
            <span className="text-xs font-medium text-foreground">
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
          <p className="mt-0.5 text-xs text-muted-foreground">
            {Object.entries(line.selectedOptions)
              .map(([key, val]) => `${key}: ${val}`)
              .join(' \u00B7 ')}
          </p>
        )}

        {/* Notes */}
        {line.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground">{line.notes}</p>
        )}
      </div>

      <div className="flex items-start gap-1 shrink-0">
        <div className="text-right">
          <div
            className="text-sm font-semibold text-foreground"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            {formatMoney(line.lineTotal)}
          </div>
          {line.lineTax > 0 && (
            <div className="text-[10px] text-muted-foreground">
              tax {formatMoney(line.lineTax)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.id)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
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
    <div className="group flex items-start justify-between gap-2 border-b border-border px-3 py-0.5">
      <div className="flex-1 min-w-0">
        <span
          className="font-medium text-foreground truncate block"
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
        >
          {line.catalogItemName}
        </span>
        {durationMinutes && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {durationMinutes} min
          </p>
        )}

        {/* Price override */}
        {line.originalUnitPrice != null && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(line.originalUnitPrice)}
            </span>
            <span className="text-xs font-medium text-foreground">
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
          <p className="mt-0.5 text-xs text-muted-foreground">{line.notes}</p>
        )}
      </div>

      <div className="flex items-start gap-1 shrink-0">
        <div className="text-right">
          <div
            className="text-sm font-semibold text-foreground"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            {formatMoney(line.lineTotal)}
          </div>
          {line.lineTax > 0 && (
            <div className="text-[10px] text-muted-foreground">
              tax {formatMoney(line.lineTax)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.id)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
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
    <div className="group flex items-start justify-between gap-2 border-b border-border px-3 py-0.5">
      <div className="flex-1 min-w-0">
        <span
          className="font-medium text-foreground truncate block"
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
        >
          {line.catalogItemName}
        </span>

        {/* Price override */}
        {line.originalUnitPrice != null && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(line.originalUnitPrice)}
            </span>
            <span className="text-xs font-medium text-foreground">
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
          <p className="mt-0.5 text-xs text-muted-foreground">
            Includes:{' '}
            {line.packageComponents
              .map((c) => c.itemName)
              .join(', ')}
          </p>
        )}

        {/* Notes */}
        {line.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground">{line.notes}</p>
        )}
      </div>

      <div className="flex items-start gap-1 shrink-0">
        <div className="text-right">
          <div
            className="text-sm font-semibold text-foreground"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            {formatMoney(line.lineTotal)}
          </div>
          {line.lineTax > 0 && (
            <div className="text-[10px] text-muted-foreground">
              tax {formatMoney(line.lineTax)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.id)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          aria-label={`Remove ${line.catalogItemName}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Cart Line (type-aware) ───────────────────────────────────────

const CartLineItem = memo(function CartLineItem({ line, onRemoveItem, onUpdateQty }: {
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
});

// ── Consolidation helpers ──────────────────────────────────────────

interface ConsolidatedGroup {
  key: string;
  lines: OrderLine[];
  displayLine: OrderLine;
  count: number;
  totalCents: number;
}

function buildConsolidationKey(line: OrderLine): string {
  return `${line.catalogItemId}|${line.unitPrice}|${line.priceOverrideReason ?? ''}|${JSON.stringify(line.modifiers ?? [])}|${JSON.stringify(line.selectedOptions ?? {})}`;
}

function consolidateLines(lines: OrderLine[]): ConsolidatedGroup[] {
  const groups = new Map<string, OrderLine[]>();
  for (const line of lines) {
    const key = buildConsolidationKey(line);
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, groupLines]) => ({
    key,
    lines: groupLines,
    displayLine: groupLines[0]!,
    count: groupLines.length,
    totalCents: groupLines.reduce((sum, l) => sum + l.lineTotal, 0),
  }));
}

// ── Group Sub-Row (expanded individual item in a group) ──────────

function GroupSubRow({
  line,
  index,
  isEditing,
  onEdit,
  onRemove,
  onUpdateNote,
  onPriceOverride,
  onEditModifiers,
  onVoidLine,
  onCompLine,
  permissions,
}: {
  line: OrderLine;
  index: number;
  isEditing: boolean;
  onEdit: () => void;
  onRemove: (lineId: string) => void;
  onUpdateNote?: (lineId: string, note: string) => void;
  onPriceOverride?: (line: OrderLine) => void;
  onEditModifiers?: (line: OrderLine) => void;
  onVoidLine?: (line: OrderLine) => void;
  onCompLine?: (line: OrderLine) => void;
  permissions?: LineEditPermissions;
}) {
  const hasDetail =
    (line.modifiers && line.modifiers.length > 0) ||
    line.specialInstructions ||
    line.notes ||
    line.originalUnitPrice != null ||
    (line.selectedOptions && Object.keys(line.selectedOptions).length > 0);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEdit(); }}
        className={`group flex items-start gap-2 pl-6 pr-3 py-1.5 cursor-pointer transition-colors hover:bg-accent/50 ${isEditing ? 'bg-accent/30' : ''}`}
      >
        {/* Index badge */}
        <span className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/15 text-[10px] font-bold text-indigo-400">
          {index}
        </span>

        {/* Item detail */}
        <div className="flex-1 min-w-0">
          <span
            className="text-xs font-medium text-foreground"
            style={{ fontSize: 'calc(0.75rem * var(--pos-font-scale, 1))' }}
          >
            {line.catalogItemName}
          </span>

          {/* Price override */}
          {line.originalUnitPrice != null && (
            <div className="mt-0.5 flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground line-through">
                {formatMoney(line.originalUnitPrice)}
              </span>
              <span className="text-[10px] font-medium text-foreground">
                {formatMoney(line.unitPrice)}
              </span>
              {line.priceOverrideReason && (
                <Badge variant="warning" className="text-[9px] px-1 py-0">
                  {line.priceOverrideReason}
                </Badge>
              )}
            </div>
          )}

          {/* Modifiers */}
          {line.modifiers && line.modifiers.length > 0 && (
            <div className="mt-0.5 space-y-0.5">
              {line.modifiers.map((mod) => (
                <div key={mod.modifierId} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                  <span>{mod.name}</span>
                  {mod.priceAdjustment !== 0 && (
                    <span>+{formatMoney(mod.priceAdjustment)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Selected options */}
          {line.selectedOptions && Object.keys(line.selectedOptions).length > 0 && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {Object.entries(line.selectedOptions)
                .map(([key, val]) => `${key}: ${val}`)
                .join(' \u00B7 ')}
            </p>
          )}

          {/* Special instructions */}
          {line.specialInstructions && (
            <p className="mt-0.5 text-[10px] italic text-amber-500">
              &ldquo;{line.specialInstructions}&rdquo;
            </p>
          )}

          {/* Notes */}
          {line.notes && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">{line.notes}</p>
          )}

          {/* Hint if no detail */}
          {!hasDetail && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/50 italic">No modifiers</p>
          )}
        </div>

        {/* Right side: price + actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          <span
            className="text-xs font-semibold text-foreground"
            style={{ fontSize: 'calc(0.75rem * var(--pos-font-scale, 1))' }}
          >
            {formatMoney(line.lineTotal)}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(line.id); }}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
            aria-label={`Remove item ${index}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline edit panel for this sub-row */}
      {isEditing && onUpdateNote && permissions && (
        <LineItemEditPanel
          line={line}
          onUpdateNote={onUpdateNote}
          onRemove={onRemove}
          onPriceOverride={onPriceOverride ?? (() => {})}
          onEditModifiers={onEditModifiers ?? (() => {})}
          onVoidLine={onVoidLine ?? (() => {})}
          onCompLine={onCompLine ?? (() => {})}
          onDone={() => onEdit()}
          permissions={permissions}
        />
      )}
    </div>
  );
}

// ── Cart Component ────────────────────────────────────────────────

interface CartProps {
  order: Order | null;
  onRemoveItem: (lineId: string) => void;
  onUpdateQty?: (lineId: string, newQty: number) => void;
  onUpdateLineNote?: (lineId: string, note: string) => void;
  label?: string;
  /** Multi-select mode */
  selectMode?: boolean;
  selectedLineIds?: Set<string>;
  onToggleSelect?: (lineId: string) => void;
  onToggleSelectMode?: () => void;
  onBatchRemove?: () => void;
  onBatchDiscount?: () => void;
  /** Line-level edit actions */
  onPriceOverride?: (line: OrderLine) => void;
  onEditModifiers?: (line: OrderLine) => void;
  onVoidLine?: (line: OrderLine) => void;
  onCompLine?: (line: OrderLine) => void;
  permissions?: LineEditPermissions;
}

export const Cart = memo(function Cart({
  order,
  onRemoveItem,
  onUpdateQty,
  onUpdateLineNote,
  label = 'Cart',
  selectMode,
  selectedLineIds,
  onToggleSelect,
  onToggleSelectMode,
  onBatchRemove,
  onBatchDiscount,
  onPriceOverride,
  onEditModifiers,
  onVoidLine,
  onCompLine,
  permissions,
}: CartProps) {
  const lines = order?.lines ?? [];
  const itemCount = lines.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sortedLines = useMemo(() => [...lines].sort((a, b) => a.sortOrder - b.sortOrder), [lines]);

  // Two-level expansion state
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const toggleGroupExpand = useCallback((groupKey: string) => {
    setExpandedGroupKey((prev) => {
      if (prev === groupKey) {
        setEditingLineId(null); // collapse group = close editor
        return null;
      }
      setEditingLineId(null);
      return groupKey;
    });
  }, []);

  const toggleLineEdit = useCallback((lineId: string) => {
    setEditingLineId((prev) => (prev === lineId ? null : lineId));
  }, []);

  // Track new line IDs for slide-in animation
  const prevLineIdsRef = useRef<Set<string>>(new Set());
  const newLineIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(lines.map((l) => l.id));
    const newIds = new Set<string>();
    for (const id of currentIds) {
      if (!prevLineIdsRef.current.has(id)) {
        newIds.add(id);
      }
    }
    newLineIdsRef.current = newIds;
    prevLineIdsRef.current = currentIds;

    // Clear animation class after 300ms
    if (newIds.size > 0) {
      const timer = setTimeout(() => {
        newLineIdsRef.current = new Set();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [lines]);

  // Display-only consolidation
  const consolidated = useMemo(() => consolidateLines(sortedLines), [sortedLines]);

  // Auto-scroll to bottom when new items are added
  useEffect(() => {
    if (scrollRef.current && itemCount > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [itemCount]);

  // Auto-cleanup: if editingLineId no longer exists in lines, reset
  useEffect(() => {
    if (editingLineId && !lines.some((l) => l.id === editingLineId)) {
      setEditingLineId(null);
    }
  }, [editingLineId, lines]);

  // Auto-cleanup: if expandedGroupKey's group shrinks to count <= 1 or disappears, collapse
  useEffect(() => {
    if (expandedGroupKey) {
      const group = consolidated.find((g) => g.key === expandedGroupKey);
      if (!group || group.count <= 1) {
        setExpandedGroupKey(null);
        setEditingLineId(null);
      }
    }
  }, [expandedGroupKey, consolidated]);

  // Default permissions for the edit panel
  const editPermissions: LineEditPermissions = permissions ?? {
    priceOverride: false,
    discount: false,
    voidLine: false,
    comp: false,
  };

  return (
    <div role="region" aria-label={`${label} — ${itemCount} item${itemCount !== 1 ? 's' : ''}`} className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-0.5">
        {selectMode ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-indigo-400">
                {selectedLineIds?.size ?? 0} selected
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {(selectedLineIds?.size ?? 0) > 0 && (
                <>
                  {onBatchRemove && (
                    <button
                      type="button"
                      onClick={onBatchRemove}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  )}
                  {onBatchDiscount && (
                    <button
                      type="button"
                      onClick={onBatchDiscount}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-500/10"
                    >
                      <DollarSign className="h-3 w-3" />
                      Discount
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={onToggleSelectMode}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-foreground">{label}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
              {onToggleSelectMode && itemCount > 0 && (
                <button
                  type="button"
                  onClick={onToggleSelectMode}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Select items"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Lines */}
      {itemCount === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">No items yet</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {consolidated.map((group) => {
            const isNew = newLineIdsRef.current.has(group.displayLine.id);
            const isGroupExpanded = expandedGroupKey === group.key;
            const isSingleEditing = group.count === 1 && editingLineId === group.displayLine.id;

            return (
              <div
                key={group.key}
                className={isNew ? 'cart-line-enter' : ''}
              >
                {group.count > 1 ? (
                  /* ── Consolidated group ───────────────── */
                  <>
                    {/* Group header row */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => selectMode && onToggleSelect ? onToggleSelect(group.displayLine.id) : toggleGroupExpand(group.key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (selectMode && onToggleSelect) { onToggleSelect(group.displayLine.id); } else { toggleGroupExpand(group.key); } } }}
                      className={`group flex cursor-pointer items-start justify-between gap-2 border-b border-border px-3 py-0.5 transition-colors hover:bg-accent ${isGroupExpanded ? 'bg-accent/20' : ''}`}
                    >
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedLineIds?.has(group.displayLine.id) ?? false}
                          onChange={() => onToggleSelect?.(group.displayLine.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-border text-indigo-500 focus:ring-indigo-500"
                        />
                      )}

                      {/* Expand chevron */}
                      {!selectMode && (
                        isGroupExpanded
                          ? <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                          : <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-medium text-foreground truncate"
                            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
                          >
                            {group.displayLine.catalogItemName}
                          </span>
                          <span className="shrink-0 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-400">
                            x{group.count}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div
                          className="text-sm font-semibold text-foreground"
                          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
                        >
                          {formatMoney(group.totalCents)}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            for (const line of group.lines) {
                              onRemoveItem(line.id);
                            }
                          }}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                          aria-label={`Remove all ${group.displayLine.catalogItemName}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded sub-rows — one per individual line in the group */}
                    {isGroupExpanded && (
                      <div className="border-b border-border bg-muted/30">
                        {group.lines.map((line, idx) => (
                          <GroupSubRow
                            key={line.id}
                            line={line}
                            index={idx + 1}
                            isEditing={editingLineId === line.id}
                            onEdit={() => toggleLineEdit(line.id)}
                            onRemove={onRemoveItem}
                            onUpdateNote={onUpdateLineNote}
                            onPriceOverride={onPriceOverride}
                            onEditModifiers={onEditModifiers}
                            onVoidLine={onVoidLine}
                            onCompLine={onCompLine}
                            permissions={editPermissions}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* ── Single item row ─────────────────── */
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => selectMode && onToggleSelect ? onToggleSelect(group.displayLine.id) : toggleLineEdit(group.displayLine.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (selectMode && onToggleSelect) { onToggleSelect(group.displayLine.id); } else { toggleLineEdit(group.displayLine.id); } } }}
                      className={`cursor-pointer transition-colors hover:bg-accent ${isSingleEditing ? 'bg-accent/20' : ''}`}
                    >
                      {selectMode ? (
                        <div className="flex items-start gap-2 border-b border-border px-3 py-0.5">
                          <input
                            type="checkbox"
                            checked={selectedLineIds?.has(group.displayLine.id) ?? false}
                            onChange={() => onToggleSelect?.(group.displayLine.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-border text-indigo-500 focus:ring-indigo-500"
                          />
                          <div className="flex-1 min-w-0">
                            <CartLineItem
                              line={group.displayLine}
                              onRemoveItem={onRemoveItem}
                              onUpdateQty={onUpdateQty}
                            />
                          </div>
                        </div>
                      ) : (
                        <CartLineItem
                          line={group.displayLine}
                          onRemoveItem={onRemoveItem}
                          onUpdateQty={onUpdateQty}
                        />
                      )}
                    </div>

                    {/* Inline edit panel for single item */}
                    {isSingleEditing && onUpdateLineNote && (
                      <LineItemEditPanel
                        line={group.displayLine}
                        onUpdateNote={onUpdateLineNote}
                        onRemove={onRemoveItem}
                        onPriceOverride={onPriceOverride ?? (() => {})}
                        onEditModifiers={onEditModifiers ?? (() => {})}
                        onVoidLine={onVoidLine ?? (() => {})}
                        onCompLine={onCompLine ?? (() => {})}
                        onDone={() => setEditingLineId(null)}
                        permissions={editPermissions}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
