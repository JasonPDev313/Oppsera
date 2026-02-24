import { withTenant, db } from '@oppsera/db';
import { erpWorkflowConfigs, erpWorkflowConfigChangeLog, tenants } from '@oppsera/db';
import { TIER_WORKFLOW_DEFAULTS } from '@oppsera/shared';
import type { BusinessTier } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';

export interface WorkflowConfig {
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
  customSettings: Record<string, unknown>;
}

// ── In-memory cache (60s TTL per tenant) ────────────────────────
const _cache = new Map<string, { configs: Record<string, WorkflowConfig>; tier: BusinessTier; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export function invalidateWorkflowCache(tenantId: string): void {
  _cache.delete(tenantId);
}

async function loadTenantTier(tenantId: string): Promise<BusinessTier> {
  const rows = await db.select({ businessTier: tenants.businessTier })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return (rows[0]?.businessTier as BusinessTier) ?? 'SMB';
}

async function loadAllConfigs(tenantId: string): Promise<Record<string, WorkflowConfig>> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(erpWorkflowConfigs).where(eq(erpWorkflowConfigs.tenantId, tenantId));
    const map: Record<string, WorkflowConfig> = {};
    for (const row of rows) {
      map[`${row.moduleKey}.${row.workflowKey}`] = {
        autoMode: row.autoMode,
        approvalRequired: row.approvalRequired,
        userVisible: row.userVisible,
        customSettings: (row.customSettings ?? {}) as Record<string, unknown>,
      };
    }
    return map;
  });
}

async function ensureCache(tenantId: string): Promise<{ configs: Record<string, WorkflowConfig>; tier: BusinessTier }> {
  const cached = _cache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  const [configs, tier] = await Promise.all([loadAllConfigs(tenantId), loadTenantTier(tenantId)]);
  const entry = { configs, tier, expiresAt: Date.now() + CACHE_TTL_MS };
  _cache.set(tenantId, entry);
  return entry;
}

/**
 * Read a single workflow config. Falls back to tier defaults when no explicit row exists.
 */
export async function getWorkflowConfig(
  tenantId: string,
  moduleKey: string,
  workflowKey: string,
): Promise<WorkflowConfig> {
  const { configs, tier } = await ensureCache(tenantId);
  const key = `${moduleKey}.${workflowKey}`;
  if (configs[key]) return configs[key];

  // Fall back to tier profile default
  const defaults = TIER_WORKFLOW_DEFAULTS[tier];
  const d = defaults?.[key];
  if (d) {
    return { autoMode: d.autoMode, approvalRequired: d.approvalRequired, userVisible: d.userVisible, customSettings: {} };
  }
  // Ultimate fallback: auto + invisible
  return { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} };
}

/**
 * Get all configs for a single module.
 */
export async function getModuleWorkflowConfigs(
  tenantId: string,
  moduleKey: string,
): Promise<Record<string, WorkflowConfig>> {
  const { configs, tier } = await ensureCache(tenantId);
  const prefix = `${moduleKey}.`;
  const result: Record<string, WorkflowConfig> = {};

  // Start with tier defaults for this module
  const defaults = TIER_WORKFLOW_DEFAULTS[tier] ?? {};
  for (const [key, d] of Object.entries(defaults)) {
    if (key.startsWith(prefix)) {
      result[key] = { autoMode: d.autoMode, approvalRequired: d.approvalRequired, userVisible: d.userVisible, customSettings: {} };
    }
  }
  // Override with explicit configs
  for (const [key, cfg] of Object.entries(configs)) {
    if (key.startsWith(prefix)) {
      result[key] = cfg;
    }
  }
  return result;
}

/**
 * Get ALL workflow configs keyed by `module.workflow`.
 */
export async function getAllWorkflowConfigs(tenantId: string): Promise<Record<string, WorkflowConfig>> {
  const { configs, tier } = await ensureCache(tenantId);
  const result: Record<string, WorkflowConfig> = {};

  // Start with all tier defaults
  const defaults = TIER_WORKFLOW_DEFAULTS[tier] ?? {};
  for (const [key, d] of Object.entries(defaults)) {
    result[key] = { autoMode: d.autoMode, approvalRequired: d.approvalRequired, userVisible: d.userVisible, customSettings: {} };
  }
  // Override with explicit configs
  for (const [key, cfg] of Object.entries(configs)) {
    result[key] = cfg;
  }
  return result;
}

/**
 * Upsert a single workflow config + log the change.
 */
export async function setWorkflowConfig(
  tenantId: string,
  moduleKey: string,
  workflowKey: string,
  config: Partial<Pick<WorkflowConfig, 'autoMode' | 'approvalRequired' | 'userVisible' | 'customSettings'>>,
  changedBy: string,
  reason?: string,
): Promise<void> {
  const oldConfig = await getWorkflowConfig(tenantId, moduleKey, workflowKey);

  await withTenant(tenantId, async (tx) => {
    // Upsert the config row
    await tx
      .insert(erpWorkflowConfigs)
      .values({
        id: generateUlid(),
        tenantId,
        moduleKey,
        workflowKey,
        autoMode: config.autoMode ?? oldConfig.autoMode,
        approvalRequired: config.approvalRequired ?? oldConfig.approvalRequired,
        userVisible: config.userVisible ?? oldConfig.userVisible,
        customSettings: config.customSettings ?? oldConfig.customSettings,
      })
      .onConflictDoUpdate({
        target: [erpWorkflowConfigs.tenantId, erpWorkflowConfigs.moduleKey, erpWorkflowConfigs.workflowKey],
        set: {
          autoMode: sql`EXCLUDED.auto_mode`,
          approvalRequired: sql`EXCLUDED.approval_required`,
          userVisible: sql`EXCLUDED.user_visible`,
          customSettings: sql`EXCLUDED.custom_settings`,
          updatedAt: sql`now()`,
        },
      });

    // Append to change log
    await tx.insert(erpWorkflowConfigChangeLog).values({
      id: generateUlid(),
      tenantId,
      moduleKey,
      workflowKey,
      changedBy,
      changeType: 'manual_override',
      oldConfig: oldConfig as unknown as Record<string, unknown>,
      newConfig: { ...oldConfig, ...config } as unknown as Record<string, unknown>,
      reason: reason ?? null,
    });
  });

  invalidateWorkflowCache(tenantId);
}
