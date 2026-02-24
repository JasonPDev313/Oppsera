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
      <div className="flex gap-1.5 mt-1">
        {allowNone && (
          <button
            type="button"
            onClick={() => handleClick('none')}
            className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.96]"
            style={{
              backgroundColor: value === 'none' ? 'var(--fnb-action-void)' : 'var(--fnb-bg-elevated)',
              color: value === 'none' ? '#fff' : 'var(--fnb-text-muted)',
            }}
          >
            None
          </button>
        )}
        {allowExtra && (
          <button
            type="button"
            onClick={() => handleClick('extra')}
            className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.96]"
            style={{
              backgroundColor: value === 'extra' ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
              color: value === 'extra' ? '#fff' : 'var(--fnb-text-muted)',
            }}
          >
            Extra{extraPrice > 0 ? ` +${formatPrice(extraPrice)}` : ''}
          </button>
        )}
        {allowOnSide && (
          <button
            type="button"
            onClick={() => handleClick('on_side')}
            className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.96]"
            style={{
              backgroundColor: value === 'on_side' ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
              color: value === 'on_side' ? '#fff' : 'var(--fnb-text-muted)',
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
              : 'border border-gray-300 bg-surface text-gray-500 hover:bg-gray-100'
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
              : 'border border-gray-300 bg-surface text-gray-500 hover:bg-gray-100'
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
              : 'border border-gray-300 bg-surface text-gray-500 hover:bg-gray-100'
          }`}
        >
          On Side
        </button>
      )}
    </div>
  );
}
