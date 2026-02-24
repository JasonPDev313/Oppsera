import { db } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { getAccountingSettings } from './get-accounting-settings';
import { getRemappableTenders } from '../queries/get-remappable-tenders';
import { batchRemapGlForTenders } from '../commands/remap-gl-for-tender';

export interface AutoRemapResult {
  remapped: number;
  failed: number;
}

/**
 * Attempt auto-remap of eligible tenders after a GL mapping is saved.
 *
 * - Checks `enableAutoRemap` setting first — exits immediately if disabled
 * - Queries for remappable tenders and batch-remaps up to 50
 * - NEVER throws — failures are logged but do not block the mapping save
 * - Returns counts for the caller to include in the API response
 */
export async function tryAutoRemap(ctx: RequestContext): Promise<AutoRemapResult> {
  try {
    const settings = await getAccountingSettings(db, ctx.tenantId);
    if (!settings?.enableAutoRemap) {
      return { remapped: 0, failed: 0 };
    }

    const tenders = await getRemappableTenders({ tenantId: ctx.tenantId });
    const eligible = tenders.filter((t) => t.canRemap).map((t) => t.tenderId);
    if (eligible.length === 0) {
      return { remapped: 0, failed: 0 };
    }

    // Cap at 50 per batch (same limit as manual remap)
    const batch = eligible.slice(0, 50);
    const results = await batchRemapGlForTenders(ctx, batch, 'Auto-remap: GL mappings updated');

    const remapped = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { remapped, failed };
  } catch (error) {
    // Never throw — auto-remap failures must not block mapping save
    console.error('[auto-remap] failed:', error);
    return { remapped: 0, failed: 0 };
  }
}
