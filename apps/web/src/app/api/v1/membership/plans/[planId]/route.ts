import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { withTenant, membershipPlans } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import {
  updateMembershipPlanV2,
  updateMembershipPlanV2Schema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const planId = (ctx as any).params?.planId;
    if (!planId) {
      throw new NotFoundError('MembershipPlan');
    }

    const plan = await withTenant(ctx.tenantId, async (tx) => {
      const [row] = await (tx as any)
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
          privileges: membershipPlans.privileges,
          rules: membershipPlans.rules,
          createdAt: membershipPlans.createdAt,
        })
        .from(membershipPlans)
        .where(
          and(
            eq(membershipPlans.tenantId, ctx.tenantId),
            eq(membershipPlans.id, planId),
          ),
        )
        .limit(1);

      if (!row) {
        throw new NotFoundError('MembershipPlan', planId);
      }

      return {
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
        privileges: row.privileges ?? [],
        rules: row.rules ?? null,
        createdAt: row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      };
    });

    return NextResponse.json({ data: plan });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const planId = (ctx as any).params?.planId;
    if (!planId) {
      throw new NotFoundError('MembershipPlan');
    }

    const body = await request.json();
    const parsed = updateMembershipPlanV2Schema.safeParse({ ...body, planId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateMembershipPlanV2(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
