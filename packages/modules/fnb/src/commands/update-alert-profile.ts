import { sql, eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { auditLog } from '@oppsera/core/audit/helpers';
import { fnbKdsAlertProfiles } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateAlertProfileInput } from '../validation';

export async function updateAlertProfile(
  ctx: RequestContext,
  input: UpdateAlertProfileInput,
) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Fetch existing profile
    const [existing] = await tx
      .select()
      .from(fnbKdsAlertProfiles)
      .where(
        and(
          eq(fnbKdsAlertProfiles.tenantId, ctx.tenantId),
          eq(fnbKdsAlertProfiles.id, input.profileId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error('Alert profile not found');
    }

    // If setting as default, clear other defaults for this tenant
    if (input.isDefault) {
      await (tx as any).execute(
        sql`UPDATE fnb_kds_alert_profiles SET is_default = false
            WHERE tenant_id = ${ctx.tenantId} AND is_default = true AND id != ${input.profileId}`,
      );
    }

    // Build the SET clause with only provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.profileName !== undefined) updates.profileName = input.profileName;
    if (input.newTicketAlert !== undefined) updates.newTicketAlert = input.newTicketAlert;
    if (input.warningAlert !== undefined) updates.warningAlert = input.warningAlert;
    if (input.criticalAlert !== undefined) updates.criticalAlert = input.criticalAlert;
    if (input.rushAlert !== undefined) updates.rushAlert = input.rushAlert;
    if (input.allergyAlert !== undefined) updates.allergyAlert = input.allergyAlert;
    if (input.modificationAlert !== undefined) updates.modificationAlert = input.modificationAlert;
    if (input.completeAlert !== undefined) updates.completeAlert = input.completeAlert;
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await tx
      .update(fnbKdsAlertProfiles)
      .set(updates)
      .where(
        and(
          eq(fnbKdsAlertProfiles.tenantId, ctx.tenantId),
          eq(fnbKdsAlertProfiles.id, input.profileId),
        ),
      )
      .returning();

    return updated!;
  });

  await auditLog(ctx, 'fnb.kds.alert_profile.updated', 'fnb_kds_alert_profiles', result.id);
  return result;
}
