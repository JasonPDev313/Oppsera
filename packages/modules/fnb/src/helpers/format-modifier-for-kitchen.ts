/**
 * Format a modifier for kitchen ticket display.
 * Handles instruction-aware formatting: "NO ONION", "EXTRA TOMATO (+$1.00)", "LETTUCE ON SIDE".
 *
 * Pure function — no side effects, no DB access.
 */

export type ModifierInstruction = 'none' | 'extra' | 'on_side' | null | undefined;

export interface KitchenModifier {
  name: string;
  kitchenLabel?: string | null;
  instruction?: ModifierInstruction;
  /** Price delta in cents for the 'extra' instruction (null = use base price) */
  extraPriceDeltaCents?: number | null;
  /** Base price adjustment in cents */
  priceAdjustmentCents?: number;
}

/**
 * Format a single modifier line for kitchen printing.
 *
 * Examples:
 *   - No instruction:  "Cheddar Cheese"
 *   - None:            "NO ONION"
 *   - Extra:           "EXTRA TOMATO (+$1.00)"
 *   - On Side:         "RANCH ON SIDE"
 *   - Custom label:    "NO GLUTEN" (when kitchenLabel="GLUTEN", instruction="none")
 */
export function formatModifierForKitchen(mod: KitchenModifier): string {
  const label = (mod.kitchenLabel ?? mod.name).toUpperCase();

  switch (mod.instruction) {
    case 'none':
      return `NO ${label}`;
    case 'extra': {
      const priceCents = mod.extraPriceDeltaCents ?? mod.priceAdjustmentCents ?? 0;
      const priceStr = priceCents > 0 ? ` (+$${(priceCents / 100).toFixed(2)})` : '';
      return `EXTRA ${label}${priceStr}`;
    }
    case 'on_side':
      return `${label} ON SIDE`;
    default:
      // No instruction — return kitchen label or name as-is
      return mod.kitchenLabel ?? mod.name;
  }
}
