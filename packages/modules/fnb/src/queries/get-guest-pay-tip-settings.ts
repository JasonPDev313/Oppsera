import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

const DEFAULT_TIP_SETTINGS = {
  isActive: true,
  tipType: 'percentage' as const,
  tipPresets: [15, 20, 25],
  allowCustomTip: true,
  allowNoTip: true,
  defaultTipIndex: null as number | null,
  tipCalculationBase: 'subtotal_pre_tax' as const,
  roundingMode: 'nearest_cent' as const,
  maxTipPercent: 100,
  maxTipAmountCents: 100_000,
  sessionExpiryMinutes: 60,
};

/**
 * Tip settings for a location. Falls back to defaults if none configured.
 */
export async function getGuestPayTipSettings(tenantId: string, locationId: string) {
  return withTenant(tenantId, async (tx) => {
    const result = await tx.execute(
      sql`SELECT is_active, tip_type, tip_presets, allow_custom_tip, allow_no_tip,
                 default_tip_index, tip_calculation_base, rounding_mode,
                 max_tip_percent, max_tip_amount_cents, session_expiry_minutes
          FROM guest_pay_tip_settings
          WHERE tenant_id = ${tenantId} AND location_id = ${locationId}`,
    );

    const rows = Array.from(result as Iterable<Record<string, unknown>>);
    if (rows.length === 0) return DEFAULT_TIP_SETTINGS;

    const s = rows[0]!;
    return {
      isActive: s.is_active as boolean,
      tipType: s.tip_type as string,
      tipPresets: s.tip_presets as number[],
      allowCustomTip: s.allow_custom_tip as boolean,
      allowNoTip: s.allow_no_tip as boolean,
      defaultTipIndex: (s.default_tip_index as number) ?? null,
      tipCalculationBase: s.tip_calculation_base as string,
      roundingMode: s.rounding_mode as string,
      maxTipPercent: s.max_tip_percent as number,
      maxTipAmountCents: s.max_tip_amount_cents as number,
      sessionExpiryMinutes: s.session_expiry_minutes as number,
    };
  });
}
