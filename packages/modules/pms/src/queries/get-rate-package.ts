import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface RatePackageDetail {
  id: string;
  tenantId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  includesJson: Array<{
    itemCode: string;
    description: string;
    amountCents: number;
    entryType: string;
    frequency: string;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getRatePackage(tenantId: string, ratePackageId: string): Promise<RatePackageDetail> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        rp.id,
        rp.tenant_id,
        rp.property_id,
        rp.code,
        rp.name,
        rp.description,
        rp.rate_plan_id,
        rpl.name AS rate_plan_name,
        rp.includes_json,
        rp.is_active,
        rp.created_at,
        rp.updated_at
      FROM pms_rate_packages rp
      LEFT JOIN pms_rate_plans rpl ON rpl.id = rp.rate_plan_id AND rpl.tenant_id = rp.tenant_id
      WHERE rp.id = ${ratePackageId}
        AND rp.tenant_id = ${tenantId}
      LIMIT 1
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) {
      throw new NotFoundError('Rate package', ratePackageId);
    }

    const r = arr[0]!;

    return {
      id: String(r.id),
      tenantId: String(r.tenant_id),
      propertyId: String(r.property_id),
      code: String(r.code),
      name: String(r.name),
      description: r.description ? String(r.description) : null,
      ratePlanId: r.rate_plan_id ? String(r.rate_plan_id) : null,
      ratePlanName: r.rate_plan_name ? String(r.rate_plan_name) : null,
      includesJson: (r.includes_json ?? []) as RatePackageDetail['includesJson'],
      isActive: Boolean(r.is_active),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  });
}
