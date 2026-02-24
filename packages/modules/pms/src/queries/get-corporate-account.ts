import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface CorporateRateOverride {
  id: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  negotiatedRateCents: number;
  startDate: string | null;
  endDate: string | null;
}

export interface CorporateAccountDetail {
  id: string;
  tenantId: string;
  propertyId: string | null;
  companyName: string;
  taxId: string | null;
  billingAddressJson: Record<string, unknown> | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultRatePlanId: string | null;
  defaultRatePlanName: string | null;
  negotiatedDiscountPct: number | null;
  billingType: string;
  paymentTermsDays: number | null;
  creditLimitCents: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  rateOverrides: CorporateRateOverride[];
}

export async function getCorporateAccount(
  tenantId: string,
  accountId: string,
): Promise<CorporateAccountDetail> {
  return withTenant(tenantId, async (tx) => {
    // Fetch account with rate plan name
    const accountRows = await tx.execute(sql`
      SELECT
        ca.id, ca.tenant_id, ca.property_id, ca.company_name, ca.tax_id,
        ca.billing_address_json, ca.contact_name, ca.contact_email, ca.contact_phone,
        ca.default_rate_plan_id, rp.name AS default_rate_plan_name,
        ca.negotiated_discount_pct, ca.billing_type, ca.payment_terms_days,
        ca.credit_limit_cents, ca.notes, ca.is_active,
        ca.created_at, ca.updated_at, ca.created_by
      FROM pms_corporate_accounts ca
      LEFT JOIN pms_rate_plans rp
        ON rp.id = ca.default_rate_plan_id AND rp.tenant_id = ca.tenant_id
      WHERE ca.id = ${accountId}
        AND ca.tenant_id = ${tenantId}
      LIMIT 1
    `);

    const accountArr = Array.from(accountRows as Iterable<Record<string, unknown>>);
    if (accountArr.length === 0) {
      throw new NotFoundError('Corporate account', accountId);
    }

    const a = accountArr[0]!;

    // Fetch rate overrides with room type info
    const overrideRows = await tx.execute(sql`
      SELECT
        o.id,
        o.room_type_id,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        o.negotiated_rate_cents,
        o.start_date,
        o.end_date
      FROM pms_corporate_rate_overrides o
      INNER JOIN pms_room_types rt ON rt.id = o.room_type_id AND rt.tenant_id = o.tenant_id
      WHERE o.corporate_account_id = ${accountId}
        AND o.tenant_id = ${tenantId}
      ORDER BY rt.sort_order ASC, o.start_date ASC
    `);

    const overrideArr = Array.from(overrideRows as Iterable<Record<string, unknown>>);

    return {
      id: String(a.id),
      tenantId: String(a.tenant_id),
      propertyId: a.property_id ? String(a.property_id) : null,
      companyName: String(a.company_name),
      taxId: a.tax_id ? String(a.tax_id) : null,
      billingAddressJson: a.billing_address_json as Record<string, unknown> | null,
      contactName: a.contact_name ? String(a.contact_name) : null,
      contactEmail: a.contact_email ? String(a.contact_email) : null,
      contactPhone: a.contact_phone ? String(a.contact_phone) : null,
      defaultRatePlanId: a.default_rate_plan_id ? String(a.default_rate_plan_id) : null,
      defaultRatePlanName: a.default_rate_plan_name ? String(a.default_rate_plan_name) : null,
      negotiatedDiscountPct: a.negotiated_discount_pct != null ? Number(a.negotiated_discount_pct) : null,
      billingType: String(a.billing_type),
      paymentTermsDays: a.payment_terms_days != null ? Number(a.payment_terms_days) : null,
      creditLimitCents: a.credit_limit_cents != null ? Number(a.credit_limit_cents) : null,
      notes: a.notes ? String(a.notes) : null,
      isActive: Boolean(a.is_active),
      createdAt: String(a.created_at),
      updatedAt: String(a.updated_at),
      createdBy: a.created_by ? String(a.created_by) : null,
      rateOverrides: overrideArr.map((r) => ({
        id: String(r.id),
        roomTypeId: String(r.room_type_id),
        roomTypeCode: String(r.room_type_code),
        roomTypeName: String(r.room_type_name),
        negotiatedRateCents: Number(r.negotiated_rate_cents),
        startDate: r.start_date ? String(r.start_date) : null,
        endDate: r.end_date ? String(r.end_date) : null,
      })),
    };
  });
}
