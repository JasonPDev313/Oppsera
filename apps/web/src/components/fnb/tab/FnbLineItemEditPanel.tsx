'use client';

import { memo, useState, useCallback } from 'react';
import {
  DollarSign,
  Percent,
  Gift,
  Ban,
  Trash2,
  ChevronRight,
  ChevronDown,
  Armchair,
  UtensilsCrossed,
  Pencil,
} from 'lucide-react';
import type { FnbTabLine } from '@/types/fnb';
import { formatCents } from '@oppsera/shared';

// ── Status helpers ──────────────────────────────────────────────

type LineStatus = 'draft' | 'unsent' | 'sent' | 'fired' | 'served' | 'voided';

function canVoid(status: LineStatus): boolean {
  return ['draft', 'unsent', 'sent', 'fired', 'served'].includes(status);
}
function canComp(status: LineStatus): boolean {
  return ['draft', 'unsent', 'sent', 'fired', 'served'].includes(status);
}
function canChangePrice(status: LineStatus): boolean {
  return ['draft', 'unsent', 'sent'].includes(status);
}
function canDelete(status: LineStatus): boolean {
  return ['draft', 'unsent'].includes(status);
}
function canMove(status: LineStatus): boolean {
  return ['draft', 'unsent', 'sent'].includes(status);
}
function canEditNote(status: LineStatus): boolean {
  return ['draft', 'unsent', 'sent', 'fired'].includes(status);
}

// ── Permissions shape ──────────────────────────────────────────

export interface FnbLineEditPermissions {
  priceOverride: boolean;
  discount: boolean;
  voidLine: boolean;
  comp: boolean;
}

// ── Props ──────────────────────────────────────────────────────

export interface FnbLineItemEditPanelProps {
  line: FnbTabLine;
  onUpdateNote: (lineId: string, note: string | null) => void;
  onDelete: (lineId: string) => void;
  onChangePrice: (lineId: string, newPriceCents: number, reason: string) => void;
  onVoidLine: (lineId: string, reason: string) => void;
  onCompLine: (lineId: string, reason: string, compCategory: string) => void;
  onChangeSeat?: (lineId: string, newSeat: number) => void;
  onChangeCourse?: (lineId: string, newCourse: number) => void;
  onEditModifiers?: () => void;
  seatCount?: number;
  courseNames?: string[];
  onDone: () => void;
  permissions: FnbLineEditPermissions;
  disabled?: boolean;
}

// ── Discount Sub-Panel ─────────────────────────────────────────

function DiscountSubPanel({
  basePrice,
  onApplyDiscount,
}: {
  basePrice: number;
  onApplyDiscount: (discountedPriceCents: number) => void;
}) {
  const [mode, setMode] = useState<'percent' | 'dollar'>('percent');
  const [customValue, setCustomValue] = useState('');

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
      {customValue && parseFloat(customValue) > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {formatCents(basePrice)} &rarr;{' '}
          {formatCents(
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

// ── Action Row ─────────────────────────────────────────────────

function ActionRow({
  icon: Icon,
  iconColor,
  label,
  detail,
  onClick,
  expanded,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  label: string;
  detail?: string;
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
        <span className="flex-1 text-xs font-medium text-foreground">
          {label}
        </span>
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

// ── Void Dialog (inline) ───────────────────────────────────────

const VOID_REASONS = [
  'Customer changed mind',
  'Wrong item entered',
  'Duplicate entry',
  'Quality issue',
  'Kitchen error',
];

function VoidSubPanel({ onVoid }: { onVoid: (reason: string) => void }) {
  const [customReason, setCustomReason] = useState('');

  return (
    <div className="space-y-2 px-3 py-2 bg-surface/50">
      <div className="flex flex-wrap gap-1.5">
        {VOID_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => onVoid(reason)}
            className="rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-red-500/10 hover:border-red-500/30 active:scale-[0.97]"
          >
            {reason}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={customReason}
          onChange={(e) => setCustomReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customReason.trim()) onVoid(customReason.trim());
          }}
          placeholder="Other reason..."
          className="flex-1 rounded-md border border-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground bg-surface focus:border-red-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => customReason.trim() && onVoid(customReason.trim())}
          disabled={!customReason.trim()}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
        >
          Void
        </button>
      </div>
    </div>
  );
}

// ── Comp Dialog (inline) ───────────────────────────────────────

const COMP_CATEGORIES = ['manager', 'promo', 'quality', 'other'] as const;
const COMP_REASONS = [
  'Customer satisfaction',
  'Quality issue',
  'Manager discretion',
  'Promotional offer',
  'Employee meal',
];

function CompSubPanel({ onComp }: { onComp: (reason: string, category: string) => void }) {
  const [category, setCategory] = useState<string>('manager');
  const [customReason, setCustomReason] = useState('');

  return (
    <div className="space-y-2 px-3 py-2 bg-surface/50">
      <div className="flex gap-1.5">
        {COMP_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
              category === cat
                ? 'border-purple-500/50 bg-purple-500/10 text-purple-400'
                : 'border-border text-foreground hover:bg-accent/50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COMP_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => onComp(reason, category)}
            className="rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-purple-500/10 hover:border-purple-500/30 active:scale-[0.97]"
          >
            {reason}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={customReason}
          onChange={(e) => setCustomReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customReason.trim()) onComp(customReason.trim(), category);
          }}
          placeholder="Other reason..."
          className="flex-1 rounded-md border border-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground bg-surface focus:border-purple-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => customReason.trim() && onComp(customReason.trim(), category)}
          disabled={!customReason.trim()}
          className="rounded-md bg-purple-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
        >
          Comp
        </button>
      </div>
    </div>
  );
}

// ── Price Change Dialog (inline) ───────────────────────────────

const PRICE_REASONS = ['Price match', 'Manager discount', 'Custom'];

function PriceChangeSubPanel({
  currentPriceCents,
  onChangePrice,
}: {
  currentPriceCents: number;
  onChangePrice: (newPriceCents: number, reason: string) => void;
}) {
  const [newPrice, setNewPrice] = useState((currentPriceCents / 100).toFixed(2));
  const [reason, setReason] = useState('Price match');

  const handleApply = useCallback(() => {
    const cents = Math.round(parseFloat(newPrice) * 100);
    if (isNaN(cents) || cents < 0) return;
    onChangePrice(cents, reason);
  }, [newPrice, reason, onChangePrice]);

  return (
    <div className="space-y-2 px-3 py-2 bg-surface/50">
      <div className="flex gap-1.5">
        {PRICE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
              reason === r
                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400'
                : 'border-border text-foreground hover:bg-accent/50'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply();
          }}
          className="flex-1 rounded-md border border-input px-2 py-1 text-xs text-foreground bg-surface focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleApply}
          disabled={!newPrice || parseFloat(newPrice) < 0}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
        >
          Apply
        </button>
      </div>
      {newPrice && parseFloat(newPrice) >= 0 && Math.round(parseFloat(newPrice) * 100) !== currentPriceCents && (
        <p className="text-[10px] text-muted-foreground">
          {formatCents(currentPriceCents)} &rarr; {formatCents(Math.round(parseFloat(newPrice) * 100))}
        </p>
      )}
    </div>
  );
}

// ── Seat Picker Sub-Panel ──────────────────────────────────────

function SeatPickerSubPanel({
  currentSeat,
  seatCount,
  onSelect,
  disabled,
}: {
  currentSeat: number;
  seatCount: number;
  onSelect: (seat: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-surface/50">
      {Array.from({ length: seatCount }, (_, i) => i + 1).map((seat) => {
        const isCurrent = seat === currentSeat;
        return (
          <button
            key={seat}
            type="button"
            disabled={isCurrent || disabled}
            onClick={() => onSelect(seat)}
            className={`min-w-9 rounded-md border px-2.5 py-2 text-xs font-semibold transition-colors ${
              isCurrent
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-400 cursor-default'
                : 'border-border text-foreground hover:bg-sky-500/10 hover:border-sky-500/30 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            S{seat}
          </button>
        );
      })}
    </div>
  );
}

// ── Course Picker Sub-Panel ───────────────────────────────────

function CoursePickerSubPanel({
  currentCourse,
  courseNames,
  onSelect,
  disabled,
}: {
  currentCourse: number;
  courseNames: string[];
  onSelect: (course: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-surface/50">
      {courseNames.map((name, i) => {
        const courseNum = i + 1;
        const isCurrent = courseNum === currentCourse;
        return (
          <button
            key={courseNum}
            type="button"
            disabled={isCurrent || disabled}
            onClick={() => onSelect(courseNum)}
            className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              isCurrent
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-400 cursor-default'
                : 'border-border text-foreground hover:bg-amber-500/10 hover:border-amber-500/30 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <span className="font-bold mr-1">C{courseNum}</span>{name}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export const FnbLineItemEditPanel = memo(function FnbLineItemEditPanel({
  line,
  onUpdateNote,
  onDelete,
  onChangePrice,
  onVoidLine,
  onCompLine,
  onChangeSeat,
  onChangeCourse,
  onEditModifiers,
  seatCount,
  courseNames,
  onDone,
  permissions,
  disabled,
}: FnbLineItemEditPanelProps) {
  const [note, setNote] = useState(line.specialInstructions ?? '');
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const status = line.status as LineStatus;

  const toggleAction = useCallback((action: string) => {
    setExpandedAction((prev) => (prev === action ? null : action));
  }, []);

  const handleDiscountApply = useCallback(
    (discountedPriceCents: number) => {
      onChangePrice(line.id, discountedPriceCents, 'discount');
      onDone();
    },
    [line.id, onChangePrice, onDone],
  );

  const handlePriceChange = useCallback(
    (newPriceCents: number, reason: string) => {
      onChangePrice(line.id, newPriceCents, reason);
      onDone();
    },
    [line.id, onChangePrice, onDone],
  );

  const handleVoid = useCallback(
    (reason: string) => {
      onVoidLine(line.id, reason);
      onDone();
    },
    [line.id, onVoidLine, onDone],
  );

  const handleComp = useCallback(
    (reason: string, category: string) => {
      onCompLine(line.id, reason, category);
      onDone();
    },
    [line.id, onCompLine, onDone],
  );

  const handleChangeSeat = useCallback(
    (newSeat: number) => {
      onChangeSeat?.(line.id, newSeat);
      onDone();
    },
    [line.id, onChangeSeat, onDone],
  );

  const handleChangeCourse = useCallback(
    (newCourse: number) => {
      onChangeCourse?.(line.id, newCourse);
      onDone();
    },
    [line.id, onChangeCourse, onDone],
  );

  const modifiers = line.modifiers as Array<Record<string, unknown>> | undefined;
  const hasModifiers = (modifiers?.length ?? 0) > 0;

  return (
    <div className="border-t border-border bg-muted/50">
      {/* ── Header: Item name + pricing ─────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">
            {line.catalogItemName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {formatCents(line.unitPriceCents)} each
            </span>
            {line.qty > 1 && (
              <span className="text-xs text-muted-foreground">
                x{line.qty}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground capitalize px-1.5 py-0.5 rounded bg-muted">
              {status}
            </span>
            {(seatCount ?? 0) > 1 && (
              <span className="text-[10px] font-semibold text-sky-400 px-1.5 py-0.5 rounded bg-sky-500/10">
                S{line.seatNumber ?? 1}
              </span>
            )}
            {(courseNames?.length ?? 0) > 1 && (
              <span className="text-[10px] font-semibold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10">
                C{line.courseNumber ?? 1}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-foreground text-sm">
            {formatCents(line.extendedPriceCents)}
          </p>
        </div>
      </div>

      {/* ── Modifiers display ───────────────────────────────────── */}
      {hasModifiers && (
        <div className="px-3 py-1.5 border-b border-border">
          <div className="space-y-0.5">
            {modifiers!.map((mod, i) => (
              <div
                key={String(mod.modifierId ?? i)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                <span>{String(mod.name ?? '')}</span>
                {Number(mod.priceAdjustment ?? 0) !== 0 && (
                  <span>
                    {Number(mod.priceAdjustment) > 0 ? '+' : '\u2212'}{formatCents(Math.abs(Number(mod.priceAdjustment)))}
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
      {canEditNote(status) && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground w-10 shrink-0">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              const trimmed = note.trim() || null;
              if (trimmed !== (line.specialInstructions ?? null)) {
                onUpdateNote(line.id, trimmed);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const trimmed = note.trim() || null;
                if (trimmed !== (line.specialInstructions ?? null)) {
                  onUpdateNote(line.id, trimmed);
                }
              }
              if (e.key === 'Escape') {
                setNote(line.specialInstructions ?? '');
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={disabled}
            placeholder="Add a note..."
            className="flex-1 rounded-md border border-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground bg-surface focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
        </div>
      )}

      {/* ── Action Rows ─────────────────────────────────────────── */}
      <div className="divide-y divide-border">
        {/* Change Seat */}
        {onChangeSeat && canMove(status) && (seatCount ?? 0) > 1 && (
          <ActionRow
            icon={Armchair}
            iconColor="text-sky-400"
            label="Change Seat"
            detail={`S${line.seatNumber ?? 1}`}
            onClick={() => toggleAction('seat')}
            expanded={expandedAction === 'seat'}
          >
            <SeatPickerSubPanel
              currentSeat={line.seatNumber ?? 1}
              seatCount={seatCount!}
              onSelect={handleChangeSeat}
              disabled={disabled}
            />
          </ActionRow>
        )}

        {/* Change Course */}
        {onChangeCourse && canMove(status) && (courseNames?.length ?? 0) > 1 && (
          <ActionRow
            icon={UtensilsCrossed}
            iconColor="text-amber-400"
            label="Change Course"
            detail={courseNames?.[(line.courseNumber ?? 1) - 1] ?? `C${line.courseNumber ?? 1}`}
            onClick={() => toggleAction('course')}
            expanded={expandedAction === 'course'}
          >
            <CoursePickerSubPanel
              currentCourse={line.courseNumber ?? 1}
              courseNames={courseNames!}
              onSelect={handleChangeCourse}
              disabled={disabled}
            />
          </ActionRow>
        )}

        {/* Edit Modifiers (draft items only) */}
        {onEditModifiers && (
          <ActionRow
            icon={Pencil}
            iconColor="text-indigo-400"
            label="Edit Modifiers"
            onClick={onEditModifiers}
          />
        )}

        {/* Change Price */}
        {permissions.priceOverride && canChangePrice(status) && (
          <ActionRow
            icon={DollarSign}
            iconColor="text-indigo-400"
            label="Change Price"
            detail={formatCents(line.unitPriceCents)}
            onClick={() => toggleAction('price')}
            expanded={expandedAction === 'price'}
          >
            <PriceChangeSubPanel
              currentPriceCents={line.unitPriceCents}
              onChangePrice={handlePriceChange}
            />
          </ActionRow>
        )}

        {/* Discount */}
        {permissions.discount && canChangePrice(status) && (
          <ActionRow
            icon={Percent}
            iconColor="text-indigo-400"
            label="Discount"
            onClick={() => toggleAction('discount')}
            expanded={expandedAction === 'discount'}
          >
            <DiscountSubPanel
              basePrice={line.unitPriceCents}
              onApplyDiscount={handleDiscountApply}
            />
          </ActionRow>
        )}

        {/* Comp Item */}
        {permissions.comp && canComp(status) && (
          <ActionRow
            icon={Gift}
            iconColor="text-purple-400"
            label="Comp Item"
            onClick={() => toggleAction('comp')}
            expanded={expandedAction === 'comp'}
          >
            <CompSubPanel onComp={handleComp} />
          </ActionRow>
        )}

        {/* Void Item */}
        {permissions.voidLine && canVoid(status) && (
          <ActionRow
            icon={Ban}
            iconColor="text-red-400"
            label="Void Item"
            onClick={() => toggleAction('void')}
            expanded={expandedAction === 'void'}
          >
            <VoidSubPanel onVoid={handleVoid} />
          </ActionRow>
        )}
      </div>

      {/* ── Footer Buttons ──────────────────────────────────────── */}
      <div className="flex gap-2 px-3 py-2.5 border-t border-border">
        {canDelete(status) && (
          <button
            type="button"
            onClick={() => {
              onDelete(line.id);
              onDone();
            }}
            disabled={disabled}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 active:scale-[0.97] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Item
          </button>
        )}
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
