/**
 * Receipt Settings — Server-Side CRUD
 *
 * Cascading lookup: location-specific → tenant-wide → DEFAULT_RECEIPT_SETTINGS.
 * Uses existing `tenant_settings` table with moduleKey='receipts', settingKey='config'.
 */

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tenantSettings } from '@oppsera/db';
import { auditLog } from '../audit';
import type { RequestContext } from '../auth/context';
import type { ReceiptSettings, UpdateReceiptSettings } from '@oppsera/shared';
import { receiptSettingsSchema, DEFAULT_RECEIPT_SETTINGS, generateUlid } from '@oppsera/shared';

const MODULE_KEY = 'receipts';
const SETTING_KEY = 'config';

// ── Queries ──────────────────────────────────────────────────────

/**
 * Cascading receipt settings lookup.
 * 1. Location-specific row (if locationId provided)
 * 2. Tenant-wide row (locationId IS NULL)
 * 3. DEFAULT_RECEIPT_SETTINGS (hardcoded)
 */
export async function getReceiptSettings(
  tenantId: string,
  locationId?: string,
): Promise<ReceiptSettings> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ value: tenantSettings.value, locationId: tenantSettings.locationId })
      .from(tenantSettings)
      .where(
        sql`${tenantSettings.tenantId} = ${tenantId}
          AND ${tenantSettings.moduleKey} = ${MODULE_KEY}
          AND ${tenantSettings.settingKey} = ${SETTING_KEY}
          AND (${tenantSettings.locationId} IS NULL${
          locationId
            ? sql` OR ${tenantSettings.locationId} = ${locationId}`
            : sql``
        })`,
      );

    const items = Array.from(rows as Iterable<{ value: unknown; locationId: string | null }>);

    // Pick most specific: location > tenant
    const locationRow = locationId
      ? items.find((r) => r.locationId === locationId)
      : undefined;
    const tenantRow = items.find((r) => r.locationId == null);

    const dbValue = locationRow?.value ?? tenantRow?.value;

    if (!dbValue) return { ...DEFAULT_RECEIPT_SETTINGS };

    // Merge DB value with defaults (DB overrides defaults for present keys)
    const parsed = receiptSettingsSchema.safeParse(dbValue);
    if (!parsed.success) return { ...DEFAULT_RECEIPT_SETTINGS };

    return parsed.data;
  });
}

// ── Commands ─────────────────────────────────────────────────────

/**
 * Upsert receipt settings for a tenant (optionally per-location).
 * Merges partial input with existing settings before saving.
 */
export async function saveReceiptSettings(
  ctx: RequestContext,
  input: {
    locationId?: string | null;
    settings: UpdateReceiptSettings;
  },
): Promise<ReceiptSettings> {
  const locationId = input.locationId ?? null;

  return withTenant(ctx.tenantId, async (tx) => {
    // Read current settings to merge with partial update
    const current = await getReceiptSettingsRaw(tx, ctx.tenantId, locationId);
    const merged = { ...DEFAULT_RECEIPT_SETTINGS, ...current, ...input.settings };

    // Validate the merged result
    const parsed = receiptSettingsSchema.parse(merged);
    const jsonValue = JSON.stringify(parsed);

    await tx.execute(
      sql`INSERT INTO tenant_settings (id, tenant_id, location_id, module_key, setting_key, value, created_at, updated_at)
          VALUES (${generateUlid()}, ${ctx.tenantId}, ${locationId}, ${MODULE_KEY}, ${SETTING_KEY}, ${jsonValue}::jsonb, NOW(), NOW())
          ON CONFLICT (tenant_id, module_key, setting_key, COALESCE(location_id, '__global__'))
          DO UPDATE SET value = ${jsonValue}::jsonb, updated_at = NOW()`,
    );

    await auditLog(
      ctx,
      locationId
        ? 'settings.receipts.location.updated'
        : 'settings.receipts.updated',
      'tenant_settings',
      ctx.tenantId,
    );

    return parsed;
  });
}

// ── Internal helpers ─────────────────────────────────────────────

async function getReceiptSettingsRaw(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  locationId: string | null,
): Promise<Partial<ReceiptSettings> | null> {
  const condition = locationId
    ? sql`${tenantSettings.tenantId} = ${tenantId}
        AND ${tenantSettings.moduleKey} = ${MODULE_KEY}
        AND ${tenantSettings.settingKey} = ${SETTING_KEY}
        AND ${tenantSettings.locationId} = ${locationId}`
    : sql`${tenantSettings.tenantId} = ${tenantId}
        AND ${tenantSettings.moduleKey} = ${MODULE_KEY}
        AND ${tenantSettings.settingKey} = ${SETTING_KEY}
        AND ${tenantSettings.locationId} IS NULL`;

  const rows = await tx
    .select({ value: tenantSettings.value })
    .from(tenantSettings)
    .where(condition)
    .limit(1);

  const items = Array.from(rows as Iterable<{ value: unknown }>);
  if (items.length === 0) return null;
  return items[0]!.value as Partial<ReceiptSettings>;
}
