import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface RatePlanPrice {
  id: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  startDate: string;
  endDate: string;
  nightlyBaseCents: number;
}

export interface RatePlanDetail {
  id: string;
  tenantId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  prices: RatePlanPrice[];
}

export async function getRatePlan(tenantId: string, ratePlanId: string): Promise<RatePlanDetail> {
  return withTenant(tenantId, async (tx) => {
    // Fetch rate plan
    const planRows = await tx.execute(sql`
      SELECT
        id, tenant_id, property_id, code, name, description,
        is_default, is_active, created_at, updated_at, created_by
      FROM pms_rate_plans
      WHERE id = ${ratePlanId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    const planArr = Array.from(planRows as Iterable<Record<string, unknown>>);
    if (planArr.length === 0) {
      throw new NotFoundError('Rate plan', ratePlanId);
    }

    const plan = planArr[0]!;

    // Fetch prices with room type info
    const priceRows = await tx.execute(sql`
      SELECT
        p.id,
        p.room_type_id,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        p.start_date,
        p.end_date,
        p.nightly_base_cents
      FROM pms_rate_plan_prices p
      INNER JOIN pms_room_types rt ON rt.id = p.room_type_id AND rt.tenant_id = p.tenant_id
      WHERE p.rate_plan_id = ${ratePlanId}
        AND p.tenant_id = ${tenantId}
      ORDER BY rt.sort_order ASC, p.start_date ASC
    `);

    const priceArr = Array.from(priceRows as Iterable<Record<string, unknown>>);

    return {
      id: String(plan.id),
      tenantId: String(plan.tenant_id),
      propertyId: String(plan.property_id),
      code: String(plan.code),
      name: String(plan.name),
      description: plan.description ? String(plan.description) : null,
      isDefault: Boolean(plan.is_default),
      isActive: Boolean(plan.is_active),
      createdAt: String(plan.created_at),
      updatedAt: String(plan.updated_at),
      createdBy: plan.created_by ? String(plan.created_by) : null,
      prices: priceArr.map((r) => ({
        id: String(r.id),
        roomTypeId: String(r.room_type_id),
        roomTypeCode: String(r.room_type_code),
        roomTypeName: String(r.room_type_name),
        startDate: String(r.start_date),
        endDate: String(r.end_date),
        nightlyBaseCents: Number(r.nightly_base_cents),
      })),
    };
  });
}
