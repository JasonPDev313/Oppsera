import { eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tenantNavPreferences } from '@oppsera/db';
import { auditLog } from '../audit';
import type { RequestContext } from '../auth/context';
import type { NavItemPreference, UpdateNavPreferencesInput } from '@oppsera/shared';

export async function getNavPreferences(
  tenantId: string,
): Promise<NavItemPreference[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(tenantNavPreferences)
      .where(eq(tenantNavPreferences.tenantId, tenantId))
      .limit(1);

    if (rows.length === 0) return [];
    return (rows[0]!.itemOrder as NavItemPreference[]) ?? [];
  });
}

export async function saveNavPreferences(
  ctx: RequestContext,
  input: UpdateNavPreferencesInput,
): Promise<NavItemPreference[]> {
  return withTenant(ctx.tenantId, async (tx) => {
    const now = new Date();

    await tx
      .insert(tenantNavPreferences)
      .values({
        tenantId: ctx.tenantId,
        itemOrder: input.itemOrder,
        updatedAt: now,
        updatedBy: ctx.user.id,
      })
      .onConflictDoUpdate({
        target: tenantNavPreferences.tenantId,
        set: {
          itemOrder: input.itemOrder,
          updatedAt: now,
          updatedBy: ctx.user.id,
        },
      });

    await auditLog(ctx, 'settings.navigation.updated', 'tenant_nav_preferences', ctx.tenantId);

    return input.itemOrder;
  });
}
