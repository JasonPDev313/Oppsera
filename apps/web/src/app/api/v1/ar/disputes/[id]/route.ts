import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { withTenant } from '@oppsera/db';
import { AppError, ValidationError } from '@oppsera/shared';

const resolveDisputeSchema = z.object({
  status: z.enum(['under_review', 'resolved', 'rejected']),
  resolutionNotes: z.string().min(1).max(2000).optional(),
});

/**
 * GET /api/v1/ar/disputes/[id] — get dispute detail
 * PATCH /api/v1/ar/disputes/[id] — update dispute status (resolve/reject)
 */
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const segments = new URL(_request.url).pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 1]!;
    if (!id) throw new AppError('INVALID_ID', 'Missing dispute ID', 400);

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT d.*, c.display_name AS customer_name, ba.name AS account_name
            FROM ar_disputes d
            JOIN customers c ON c.id = d.customer_id AND c.tenant_id = d.tenant_id
            JOIN billing_accounts ba ON ba.id = d.billing_account_id AND ba.tenant_id = d.tenant_id
            WHERE d.id = ${id} AND d.tenant_id = ${ctx.tenantId}`,
      );
      const items = Array.from(rows as Iterable<Record<string, unknown>>);
      if (items.length === 0) return null;
      const r = items[0]!;
      return {
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
      };
    });

    if (!result) {
      throw new AppError('NOT_FOUND', 'Dispute not found', 404);
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'ar.*' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 1]!;
    if (!id) throw new AppError('INVALID_ID', 'Missing dispute ID', 400);
    const body = await request.json();
    const parsed = resolveDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;
    const isTerminal = input.status === 'resolved' || input.status === 'rejected';

    await withTenant(ctx.tenantId, async (tx) => {
      // Verify dispute exists and is not already terminal
      const existing = await tx.execute(
        sql`SELECT status FROM ar_disputes WHERE id = ${id} AND tenant_id = ${ctx.tenantId}`,
      );
      const rows = Array.from(existing as Iterable<Record<string, unknown>>);
      if (rows.length === 0) throw new AppError('NOT_FOUND', 'Dispute not found', 404);
      const currentStatus = rows[0]!.status as string;
      if (currentStatus === 'resolved' || currentStatus === 'rejected') {
        throw new AppError('DISPUTE_CLOSED', `Dispute is already ${currentStatus}`, 409);
      }

      await tx.execute(
        sql`UPDATE ar_disputes
            SET status = ${input.status},
                resolution_notes = COALESCE(${input.resolutionNotes ?? null}, resolution_notes),
                resolved_by = ${isTerminal ? ctx.user.id : null},
                resolved_at = ${isTerminal ? sql`NOW()` : sql`NULL`},
                updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${ctx.tenantId}`,
      );
    });

    auditLogDeferred(ctx, `ar.dispute.${input.status}`, 'ar_dispute', id, undefined, {
      newStatus: input.status,
      resolutionNotes: input.resolutionNotes,
    });

    return NextResponse.json({ data: { id, status: input.status } });
  },
  { entitlement: 'accounting', permission: 'ar.disputes.manage', writeAccess: true },
);
