import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { withTenant, membershipPlans } from '@oppsera/db';
import { eq, desc } from 'drizzle-orm';
import {
  createMembershipPlanV2,
  createMembershipPlanV2Schema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const plans = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await (tx as any)
        .select({
          id: membershipPlans.id,
          name: membershipPlans.name,
          description: membershipPlans.description,
          priceCents: membershipPlans.priceCents,
          duesAmountCents: membershipPlans.duesAmountCents,
          billingFrequency: membershipPlans.billingFrequency,
          prorationPolicy: membershipPlans.prorationPolicy,
          minMonthsCommitment: membershipPlans.minMonthsCommitment,
          taxable: membershipPlans.taxable,
          isActive: membershipPlans.isActive,
          createdAt: membershipPlans.createdAt,
        })
        .from(membershipPlans)
        .where(eq(membershipPlans.tenantId, ctx.tenantId))
        .orderBy(desc(membershipPlans.createdAt));

      return rows.map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        description: row.description ? String(row.description) : null,
        priceCents: Number(row.priceCents ?? 0),
        duesAmountCents: row.duesAmountCents != null ? Number(row.duesAmountCents) : null,
        billingFrequency: String(row.billingFrequency ?? 'monthly'),
        prorationPolicy: String(row.prorationPolicy ?? 'daily'),
        minMonthsCommitment: row.minMonthsCommitment != null ? Number(row.minMonthsCommitment) : null,
        taxable: Boolean(row.taxable ?? true),
        isActive: Boolean(row.isActive ?? true),
        createdAt: row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      }));
    });

    return NextResponse.json({ data: plans });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createMembershipPlanV2Schema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createMembershipPlanV2(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
