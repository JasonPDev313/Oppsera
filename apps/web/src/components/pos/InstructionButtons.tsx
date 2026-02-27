'use client';

/**
 * Instruction buttons for modifier selection in POS dialogs.
 * Renders [None] [Extra] [On Side] pills, conditionally shown based on modifier config.
 * Shared between Retail ModifierDialog and F&B FnbModifierDrawer.
 */

export type ModifierInstruction = 'none' | 'extra' | 'on_side' | null;

interface InstructionButtonsProps {
  allowNone: boolean;
  allowExtra: boolean;
  allowOnSide: boolean;
  /** Current instruction selection for this modifier */
  value: ModifierInstruction;
  onChange: (instruction: ModifierInstruction) => void;
  /** Extra price delta in cents (shown on Extra button) */
  extraPriceDeltaCents?: number | null;
  /** Base price in cents (shown on Extra button when no delta) */
  basePriceCents?: number;
  /** Use F&B design tokens instead of Tailwind classes */
  variant?: 'retail' | 'fnb';
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function InstructionButtons({
  allowNone,
  allowExtra,
  allowOnSide,
  value,
  onChange,
  extraPriceDeltaCents,
  basePriceCents,
  variant = 'retail',
}: InstructionButtonsProps) {
  const hasAny = allowNone || allowExtra || allowOnSide;
  if (!hasAny) return null;

  const handleClick = (instruction: ModifierInstruction) => {
    // Toggle off if same button clicked again
    onChange(value === instruction ? null : instruction);
  };

  const extraPrice = extraPriceDeltaCents ?? basePriceCents ?? 0;

  if (variant === 'fnb') {
    return (
      <div className="flex gap-2 shrink-0 mt-1">
        {allowNone && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClick('none'); }}
            className="rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-[0.96]"
            style={{
              backgroundColor: value === 'none' ? 'var(--fnb-action-void)' : 'transparent',
              color: value === 'none' ? '#fff' : 'var(--fnb-text-primary)',
              border: value === 'none'
                ? '1.5px solid var(--fnb-action-void)'
                : '1.5px solid rgba(148, 163, 184, 0.35)',
            }}
          >
            None
          </button>
        )}
        {allowExtra && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClick('extra'); }}
            className="rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-[0.96]"
            style={{
              backgroundColor: value === 'extra' ? 'var(--fnb-status-entrees-fired)' : 'transparent',
              color: value === 'extra' ? '#fff' : 'var(--fnb-text-primary)',
              border: value === 'extra'
                ? '1.5px solid var(--fnb-status-entrees-fired)'
                : '1.5px solid rgba(148, 163, 184, 0.35)',
            }}
          >
            Extra{extraPrice > 0 ? ` +${formatPrice(extraPrice)}` : ''}
          </button>
        )}
        {allowOnSide && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClick('on_side'); }}
            className="rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-[0.96]"
            style={{
              backgroundColor: value === 'on_side' ? 'var(--fnb-info)' : 'transparent',
              color: value === 'on_side' ? '#fff' : 'var(--fnb-text-primary)',
              border: value === 'on_side'
                ? '1.5px solid var(--fnb-info)'
                : '1.5px solid rgba(148, 163, 184, 0.35)',
            }}
          >
            On Side
          </button>
        )}
      </div>
    );
  }

  // Retail variant — uses Tailwind classes
  return (
    <div className="flex gap-1.5 mt-1">
      {allowNone && (
        <button
          type="button"
          onClick={() => handleClick('none')}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            value === 'none'
              ? 'bg-red-500 text-white'
              : 'border border-border bg-surface text-muted-foreground hover:bg-accent'
          }`}
        >
          None
        </button>
      )}
      {allowExtra && (
        <button
          type="button"
          onClick={() => handleClick('extra')}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            value === 'extra'
              ? 'bg-green-600 text-white'
              : 'border border-border bg-surface text-muted-foreground hover:bg-accent'
          }`}
        >
          Extra{extraPrice > 0 ? ` +${formatPrice(extraPrice)}` : ''}
        </button>
      )}
      {allowOnSide && (
        <button
          type="button"
          onClick={() => handleClick('on_side')}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            value === 'on_side'
              ? 'bg-blue-500 text-white'
              : 'border border-border bg-surface text-muted-foreground hover:bg-accent'
          }`}
        >
          On Side
        </button>
      )}
    </div>
  );
}
