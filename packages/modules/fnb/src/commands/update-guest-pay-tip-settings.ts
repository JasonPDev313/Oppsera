import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid } from '@oppsera/shared';
import { FNB_EVENTS } from '../events/types';
import type { UpdateGuestPayTipSettingsInput } from '../validation';

export async function updateGuestPayTipSettings(
  ctx: RequestContext,
  input: UpdateGuestPayTipSettingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Build SET clauses dynamically from provided fields
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: Record<string, unknown> = {};

    if (input.isActive !== undefined) {
      values.is_active = input.isActive;
    }
    if (input.tipType !== undefined) {
      values.tip_type = input.tipType;
    }
    if (input.tipPresets !== undefined) {
      values.tip_presets = JSON.stringify(input.tipPresets);
    }
    if (input.allowCustomTip !== undefined) {
      values.allow_custom_tip = input.allowCustomTip;
    }
    if (input.allowNoTip !== undefined) {
      values.allow_no_tip = input.allowNoTip;
    }
    if (input.defaultTipIndex !== undefined) {
      values.default_tip_index = input.defaultTipIndex;
    }
    if (input.tipCalculationBase !== undefined) {
      values.tip_calculation_base = input.tipCalculationBase;
    }
    if (input.roundingMode !== undefined) {
      values.rounding_mode = input.roundingMode;
    }
    if (input.maxTipPercent !== undefined) {
      values.max_tip_percent = input.maxTipPercent;
    }
    if (input.maxTipAmountCents !== undefined) {
      values.max_tip_amount_cents = input.maxTipAmountCents;
    }
    if (input.sessionExpiryMinutes !== undefined) {
      values.session_expiry_minutes = input.sessionExpiryMinutes;
    }

    // Upsert — insert if not exists, update if exists
    const id = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_tip_settings (
            id, tenant_id, location_id,
            is_active, tip_type, tip_presets, allow_custom_tip, allow_no_tip,
            default_tip_index, tip_calculation_base, rounding_mode,
            max_tip_percent, max_tip_amount_cents, session_expiry_minutes,
            created_at, updated_at
          ) VALUES (
            ${id}, ${ctx.tenantId}, ${input.locationId},
            ${input.isActive ?? true},
            ${input.tipType ?? 'percentage'},
            ${JSON.stringify(input.tipPresets ?? [15, 20, 25])}::jsonb,
            ${input.allowCustomTip ?? true},
            ${input.allowNoTip ?? true},
            ${input.defaultTipIndex ?? null},
            ${input.tipCalculationBase ?? 'subtotal_pre_tax'},
            ${input.roundingMode ?? 'nearest_cent'},
            ${input.maxTipPercent ?? 100},
            ${input.maxTipAmountCents ?? 100_000},
            ${input.sessionExpiryMinutes ?? 60},
            NOW(), NOW()
          )
          ON CONFLICT (tenant_id, location_id) DO UPDATE SET
            is_active = COALESCE(${input.isActive ?? null}::boolean, guest_pay_tip_settings.is_active),
            tip_type = COALESCE(${input.tipType ?? null}, guest_pay_tip_settings.tip_type),
            tip_presets = COALESCE(${input.tipPresets ? JSON.stringify(input.tipPresets) : null}::jsonb, guest_pay_tip_settings.tip_presets),
            allow_custom_tip = COALESCE(${input.allowCustomTip ?? null}::boolean, guest_pay_tip_settings.allow_custom_tip),
            allow_no_tip = COALESCE(${input.allowNoTip ?? null}::boolean, guest_pay_tip_settings.allow_no_tip),
            default_tip_index = ${input.defaultTipIndex !== undefined ? input.defaultTipIndex : null},
            tip_calculation_base = COALESCE(${input.tipCalculationBase ?? null}, guest_pay_tip_settings.tip_calculation_base),
            rounding_mode = COALESCE(${input.roundingMode ?? null}, guest_pay_tip_settings.rounding_mode),
            max_tip_percent = COALESCE(${input.maxTipPercent ?? null}::integer, guest_pay_tip_settings.max_tip_percent),
            max_tip_amount_cents = COALESCE(${input.maxTipAmountCents ?? null}::integer, guest_pay_tip_settings.max_tip_amount_cents),
            session_expiry_minutes = COALESCE(${input.sessionExpiryMinutes ?? null}::integer, guest_pay_tip_settings.session_expiry_minutes),
            updated_at = NOW()`,
    );

    const changedKeys = Object.keys(values);

    const event = buildEventFromContext(ctx, FNB_EVENTS.SETTINGS_UPDATED, {
      moduleKey: 'guest_pay_tip',
      locationId: input.locationId,
      changedKeys,
      updatedBy: ctx.user.id,
    });

    return { result: { locationId: input.locationId, updated: changedKeys }, events: [event] };
  });

  await auditLog(ctx, 'fnb.guestpay.tip_settings_updated', 'guest_pay_tip_settings', input.locationId);
  return result;
}
