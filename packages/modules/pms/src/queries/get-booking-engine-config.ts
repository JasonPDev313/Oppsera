import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsBookingEngineConfig } from '@oppsera/db';

export interface BookingEngineConfigDetail {
  id: string;
  propertyId: string;
  isActive: boolean;
  widgetThemeJson: Record<string, unknown>;
  allowedRatePlanIds: string[];
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  termsUrl: string | null;
  privacyUrl: string | null;
  confirmationTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getBookingEngineConfig(
  tenantId: string,
  propertyId: string,
): Promise<BookingEngineConfigDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pmsBookingEngineConfig)
      .where(and(
        eq(pmsBookingEngineConfig.tenantId, tenantId),
        eq(pmsBookingEngineConfig.propertyId, propertyId),
      ))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      propertyId: row.propertyId,
      isActive: row.isActive,
      widgetThemeJson: (row.widgetThemeJson ?? {}) as Record<string, unknown>,
      allowedRatePlanIds: row.allowedRatePlanIds ?? [],
      minLeadTimeHours: row.minLeadTimeHours,
      maxAdvanceDays: row.maxAdvanceDays,
      termsUrl: row.termsUrl,
      privacyUrl: row.privacyUrl,
      confirmationTemplateId: row.confirmationTemplateId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
