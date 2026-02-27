'use client';

import { memo, useState, useCallback } from 'react';
import {
  DollarSign,
  Percent,
  Pencil,
  Gift,
  Ban,
  Trash2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OrderLine } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Permissions shape ──────────────────────────────────────────────

export interface LineEditPermissions {
  priceOverride: boolean;
  discount: boolean;
  voidLine: boolean;
  comp: boolean;
}

// ── Props ──────────────────────────────────────────────────────────

export interface LineItemEditPanelProps {
  line: OrderLine;
  onUpdateNote: (lineId: string, note: string) => void;
  onRemove: (lineId: string) => void;
  onPriceOverride: (line: OrderLine) => void;
  onEditModifiers: (line: OrderLine) => void;
  onVoidLine: (line: OrderLine) => void;
  onCompLine: (line: OrderLine) => void;
  onDone: () => void;
  permissions: LineEditPermissions;
}

// ── Inline Discount Sub-Panel ──────────────────────────────────────

function DiscountSubPanel({
  line,
  onApplyDiscount,
}: {
  line: OrderLine;
  onApplyDiscount: (discountedPriceCents: number) => void;
}) {
  const [mode, setMode] = useState<'percent' | 'dollar'>('percent');
  const [customValue, setCustomValue] = useState('');
  const basePrice = line.originalUnitPrice ?? line.unitPrice;

  const applyPercent = useCallback(
    (pct: number) => {
      const discounted = Math.round(basePrice * (1 - pct / 100));
      onApplyDiscount(Math.max(0, discounted));
    },
    [basePrice, onApplyDiscount],
  );

  const applyCustom = useCallback(() => {
    const val = parseFloat(customValue);
    if (isNaN(val) || val <= 0) return;
    if (mode === 'percent') {
      const discounted = Math.round(basePrice * (1 - val / 100));
      onApplyDiscount(Math.max(0, discounted));
    } else {
      const discounted = basePrice - Math.round(val * 100);
      onApplyDiscount(Math.max(0, discounted));
    }
  }, [basePrice, customValue, mode, onApplyDiscount]);

  return (
    <div className="space-y-2 px-3 py-2 bg-surface/50">
      {/* Quick percent buttons */}
      <div className="flex gap-1.5">
        {[5, 10, 15, 20].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => applyPercent(pct)}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-indigo-500/10 hover:border-indigo-500/30 active:scale-[0.97]"
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="flex items-center gap-1.5">
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('percent')}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              mode === 'percent'
                ? 'bg-indigo-600 text-white'
                : 'bg-surface text-muted-foreground hover:bg-accent'
            }`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => setMode('dollar')}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              mode === 'dollar'
                ? 'bg-indigo-600 text-white'
                : 'bg-surface text-muted-foreground hover:bg-accent'
            }`}
          >
            $
          </button>
        </div>
        <input
          type="number"
          min="0"
          step={mode === 'percent' ? '1' : '0.01'}
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyCustom();
          }}
          placeholder={mode === 'percent' ? 'Enter %' : 'Enter $'}
          className="flex-1 rounded-md border border-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground bg-surface focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={applyCustom}
          disabled={!customValue || parseFloat(customValue) <= 0}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
        >
          Apply
        </button>
      </div>

      {/* Preview */}
      {customValue && parseFloat(customValue) > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {formatMoney(basePrice)} &rarr;{' '}
          {formatMoney(
            Math.max(
              0,
              mode === 'percent'
                ? Math.round(basePrice * (1 - parseFloat(customValue) / 100))
                : basePrice - Math.round(parseFloat(customValue) * 100),
            ),
          )}
        </p>
      )}
    </div>
  );
}

// ── Action Row ─────────────────────────────────────────────────────

function ActionRow({
  icon: Icon,
  iconColor,
  label,
  detail,
  badge,
  onClick,
  expanded,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  label: string;
  detail?: string;
  badge?: string;
  onClick: () => void;
  expanded?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 active:bg-accent"
      >
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span
          className="flex-1 text-xs font-medium text-foreground"
          style={{ fontSize: 'calc(0.75rem * var(--pos-font-scale, 1))' }}
        >
          {label}
        </span>
        {badge && (
          <Badge variant="warning" className="text-[10px] mr-1">
            {badge}
          </Badge>
        )}
        {detail && (
          <span className="text-xs text-muted-foreground mr-1">{detail}</span>
        )}
        {children ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {expanded && children}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export const LineItemEditPanel = memo(function LineItemEditPanel({
  line,
  onUpdateNote,
  onRemove,
  onPriceOverride,
  onEditModifiers,
  onVoidLine,
  onCompLine,
  onDone,
  permissions,
}: LineItemEditPanelProps) {
  const [note, setNote] = useState(line.notes ?? '');
  const [discountOpen, setDiscountOpen] = useState(false);

  const hasModifiers = (line.modifiers?.length ?? 0) > 0;
  const isOverridden = line.originalUnitPrice != null;

  const handleDiscountApply = useCallback(
    (discountedPriceCents: number) => {
      // Discount is implemented as a price override with reason "discount"
      onPriceOverride({
        ...line,
        // Signal to handler that this is a discount — pass the new price via a synthetic override
        _discountPrice: discountedPriceCents,
      } as OrderLine & { _discountPrice: number });
      setDiscountOpen(false);
    },
    [line, onPriceOverride],
  );

  return (
    <div className="border-t border-border bg-muted/50">
      {/* ── Header: Item name + current pricing ─────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-foreground truncate"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            {line.catalogItemName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {formatMoney(line.unitPrice)} each
            </span>
            {isOverridden && (
              <>
                <span className="text-xs text-muted-foreground line-through">
                  {formatMoney(line.originalUnitPrice!)}
                </span>
                {line.priceOverrideReason && (
                  <Badge variant="warning" className="text-[10px]">
                    {line.priceOverrideReason}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p
            className="font-semibold text-foreground"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            {formatMoney(line.lineTotal)}
          </p>
          {line.lineTax > 0 && (
            <p className="text-[10px] text-muted-foreground">
              tax {formatMoney(line.lineTax)}
            </p>
          )}
        </div>
      </div>

      {/* ── Modifiers display ───────────────────────────────────── */}
      {hasModifiers && (
        <div className="px-3 py-1.5 border-b border-border">
          <div className="space-y-0.5">
            {line.modifiers!.map((mod) => (
              <div
                key={mod.modifierId}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                <span>{mod.name}</span>
                {mod.priceAdjustment !== 0 && (
                  <span className="text-muted-foreground">
                    +{formatMoney(mod.priceAdjustment)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Special instructions display ─────────────────────────── */}
      {line.specialInstructions && (
        <div className="px-3 py-1.5 border-b border-border">
          <p className="text-xs italic text-amber-500">
            &ldquo;{line.specialInstructions}&rdquo;
          </p>
        </div>
      )}

      {/* ── Note input ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground w-10 shrink-0">Note</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onUpdateNote(line.id, note)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onUpdateNote(line.id, note);
            if (e.key === 'Escape') {
              setNote(line.notes ?? '');
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Add a note..."
          className="flex-1 rounded-md border border-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground bg-surface focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* ── Action Rows ─────────────────────────────────────────── */}
      <div className="divide-y divide-border">
        {/* Change Price */}
        {permissions.priceOverride && (
          <ActionRow
            icon={DollarSign}
            iconColor="text-indigo-400"
            label="Change Price"
            detail={formatMoney(line.unitPrice)}
            badge={isOverridden ? 'overridden' : undefined}
            onClick={() => onPriceOverride(line)}
          />
        )}

        {/* Discount */}
        {permissions.discount && (
          <ActionRow
            icon={Percent}
            iconColor="text-indigo-400"
            label="Discount"
            onClick={() => setDiscountOpen((prev) => !prev)}
            expanded={discountOpen}
          >
            <DiscountSubPanel line={line} onApplyDiscount={handleDiscountApply} />
          </ActionRow>
        )}

        {/* Edit Modifiers */}
        {hasModifiers && (
          <ActionRow
            icon={Pencil}
            iconColor="text-blue-400"
            label="Edit Modifiers"
            detail={`${line.modifiers!.length} selected`}
            onClick={() => onEditModifiers(line)}
          />
        )}

        {/* Comp Item */}
        {permissions.comp && (
          <ActionRow
            icon={Gift}
            iconColor="text-purple-400"
            label="Comp Item"
            onClick={() => onCompLine(line)}
          />
        )}

        {/* Void Item */}
        {permissions.voidLine && (
          <ActionRow
            icon={Ban}
            iconColor="text-red-400"
            label="Void Item"
            onClick={() => onVoidLine(line)}
          />
        )}
      </div>

      {/* ── Footer Buttons ──────────────────────────────────────── */}
      <div className="flex gap-2 px-3 py-2.5 border-t border-border">
        <button
          type="button"
          onClick={() => {
            onRemove(line.id);
            onDone();
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 active:scale-[0.97]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Item
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 active:scale-[0.97]"
        >
          Done
        </button>
      </div>
    </div>
  );
});
