import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { withTenant } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

const createDisputeSchema = z.object({
  billingAccountId: z.string().min(1),
  customerId: z.string().min(1),
  invoiceId: z.string().optional(),
  reason: z.string().min(5).max(2000),
  amountCents: z.number().int().min(1),
});

/**
 * GET /api/v1/ar/disputes — list disputes for a billing account
 * POST /api/v1/ar/disputes — create a new dispute
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const billingAccountId = request.nextUrl.searchParams.get('billingAccountId');
    const status = request.nextUrl.searchParams.get('status');
    const cursor = request.nextUrl.searchParams.get('cursor');
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 25), 100);

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT d.id, d.dispute_number, d.billing_account_id, d.customer_id,
                   d.invoice_id, d.status, d.reason, d.amount_cents,
                   d.resolution_notes, d.resolved_by, d.resolved_at,
                   d.created_by, d.created_at, d.updated_at,
                   c.display_name AS customer_name,
                   ba.name AS account_name
            FROM ar_disputes d
            JOIN customers c ON c.id = d.customer_id AND c.tenant_id = d.tenant_id
            JOIN billing_accounts ba ON ba.id = d.billing_account_id AND ba.tenant_id = d.tenant_id
            WHERE d.tenant_id = ${ctx.tenantId}
              AND (${billingAccountId ?? null}::text IS NULL OR d.billing_account_id = ${billingAccountId ?? ''})
              AND (${status ?? null}::text IS NULL OR d.status = ${status ?? ''})
              AND (${cursor ?? null}::text IS NULL OR d.created_at < (SELECT created_at FROM ar_disputes WHERE id = ${cursor ?? ''}))
            ORDER BY d.created_at DESC
            LIMIT ${limit + 1}`,
      );

      const items = Array.from(rows as Iterable<Record<string, unknown>>);
      const hasMore = items.length > limit;
      if (hasMore) items.pop();

      return {
        data: items.map(r => ({
          id: r.id,
          disputeNumber: r.dispute_number,
          billingAccountId: r.billing_account_id,
          customerId: r.customer_id,
          customerName: r.customer_name,
          accountName: r.account_name,
          invoiceId: r.invoice_id,
          status: r.status,
          reason: r.reason,
          amountCents: Number(r.amount_cents),
          resolutionNotes: r.resolution_notes,
          resolvedBy: r.resolved_by,
          resolvedAt: r.resolved_at,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        meta: {
          cursor: items.length > 0 ? (items[items.length - 1]!.id as string) : null,
          hasMore,
        },
      };
    });

    return NextResponse.json(result);
  },
  { entitlement: 'accounting', permission: 'ar.*' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;
    const id = generateUlid();
    const disputeNumber = `DSP-${Date.now().toString(36).toUpperCase()}`;

    await withTenant(ctx.tenantId, async (tx) => {
      await tx.execute(
        sql`INSERT INTO ar_disputes (id, tenant_id, billing_account_id, customer_id, invoice_id,
                                      dispute_number, reason, amount_cents, created_by)
            VALUES (${id}, ${ctx.tenantId}, ${input.billingAccountId}, ${input.customerId},
                    ${input.invoiceId ?? null}, ${disputeNumber}, ${input.reason},
                    ${input.amountCents}, ${ctx.user.id})`,
      );
    });

    auditLogDeferred(ctx, 'ar.dispute.created', 'ar_dispute', id, undefined, {
      disputeNumber,
      billingAccountId: input.billingAccountId,
      amountCents: input.amountCents,
    });

    return NextResponse.json({
      data: { id, disputeNumber, status: 'open' },
    }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'ar.disputes.create', writeAccess: true },
);
