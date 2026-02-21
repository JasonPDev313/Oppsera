import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { pmsProperties } from '@oppsera/db';

export interface PropertyDetail {
  id: string;
  tenantId: string;
  name: string;
  timezone: string;
  currency: string;
  addressJson: Record<string, unknown> | null;
  taxRatePct: string;
  checkInTime: string;
  checkOutTime: string;
  nightAuditTime: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export async function getProperty(tenantId: string, propertyId: string): Promise<PropertyDetail> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, propertyId), eq(pmsProperties.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Property', propertyId);
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      timezone: row.timezone,
      currency: row.currency,
      addressJson: row.addressJson ?? null,
      taxRatePct: row.taxRatePct,
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      nightAuditTime: row.nightAuditTime,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy ?? null,
    };
  });
}
