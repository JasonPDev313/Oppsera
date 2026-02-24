import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { withTenant, autopayAttempts, autopayRuns, customerPaymentMethods } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * POST /api/v1/membership/autopay/process
 *
 * Processes pending autopay attempts by charging stored payment methods via PaymentsFacade.
 * Called by Vercel Cron or manually by admin after runAutopayBatch creates pending attempts.
 *
 * This is the orchestration layer — it bridges the membership module (attempts) with
 * the payments module (gateway API) without creating a cross-module dependency.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!hasPaymentsGateway()) {
      return NextResponse.json(
        { error: { code: 'GATEWAY_NOT_CONFIGURED', message: 'Payment gateway is not configured' } },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const runId = url.searchParams.get('runId') ?? undefined;
    const batchSize = Math.min(parseInt(url.searchParams.get('batchSize') ?? '50', 10), 200);

    const results = await processAutopayAttempts(ctx.tenantId, runId, batchSize);

    return NextResponse.json({ data: results });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage', writeAccess: true },
);

// ── Processor ────────────────────────────────────────────────────────

interface ProcessResults {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ attemptId: string; error: string }>;
}

async function processAutopayAttempts(
  tenantId: string,
  runId: string | undefined,
  batchSize: number,
): Promise<ProcessResults> {
  const results: ProcessResults = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // 1. Fetch pending attempts
  const pendingAttempts = await withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(autopayAttempts.tenantId, tenantId),
      eq(autopayAttempts.status, 'pending'),
    ];
    if (runId) {
      conditions.push(eq(autopayAttempts.runId, runId));
    }

    return tx
      .select({
        id: autopayAttempts.id,
        runId: autopayAttempts.runId,
        membershipAccountId: autopayAttempts.membershipAccountId,
        paymentMethodId: autopayAttempts.paymentMethodId,
        amountCents: autopayAttempts.amountCents,
        attemptNumber: autopayAttempts.attemptNumber,
      })
      .from(autopayAttempts)
      .where(and(...conditions))
      .limit(batchSize);
  });

  if (pendingAttempts.length === 0) {
    return results;
  }

  // 2. Batch-load payment methods for all attempts (includes paymentType + ACH fields)
  const methodIds = [...new Set(pendingAttempts.map((a) => a.paymentMethodId).filter(Boolean))] as string[];
  const paymentMethodsMap = new Map<string, {
    token: string;
    customerId: string;
    paymentType: string;
    bankAccountType: string | null;
    last4: string | null;
  }>();

  if (methodIds.length > 0) {
    const methods = await withTenant(tenantId, async (tx) => {
      return tx
        .select({
          id: customerPaymentMethods.id,
          token: customerPaymentMethods.token,
          customerId: customerPaymentMethods.customerId,
          paymentType: customerPaymentMethods.paymentType,
          bankAccountType: customerPaymentMethods.bankAccountType,
          last4: customerPaymentMethods.last4,
        })
        .from(customerPaymentMethods)
        .where(
          and(
            eq(customerPaymentMethods.tenantId, tenantId),
            inArray(customerPaymentMethods.id, methodIds),
            eq(customerPaymentMethods.status, 'active'),
          ),
        );
    });

    for (const m of methods) {
      paymentMethodsMap.set(m.id, {
        token: m.token,
        customerId: m.customerId,
        paymentType: m.paymentType,
        bankAccountType: m.bankAccountType,
        last4: m.last4,
      });
    }
  }

  const gateway = getPaymentsGatewayApi();

  // 3. Process each attempt
  for (const attempt of pendingAttempts) {
    results.processed++;

    const paymentMethod = attempt.paymentMethodId
      ? paymentMethodsMap.get(attempt.paymentMethodId)
      : null;

    if (!paymentMethod) {
      // No valid payment method — skip
      await updateAttemptStatus(tenantId, attempt.id, 'failed', 'No active payment method found');
      results.failed++;
      results.errors.push({ attemptId: attempt.id, error: 'No active payment method' });
      continue;
    }

    if (attempt.amountCents <= 0) {
      // Zero or negative amount — skip (amount was not resolved by strategy)
      await updateAttemptStatus(tenantId, attempt.id, 'skipped', 'Amount is zero — strategy not yet resolved');
      results.skipped++;
      continue;
    }

    // Build synthetic RequestContext for gateway call
    const syntheticCtx = {
      tenantId,
      locationId: null,
      user: { id: 'system:autopay', email: 'system', name: 'Autopay System', role: 'system' as const },
      requestId: `autopay-${attempt.id}`,
    };

    try {
      const isAch = paymentMethod.paymentType === 'bank_account';

      // Build sale input — ACH payments require achSecCode and achAccountType
      const saleInput: Record<string, unknown> = {
        amountCents: attempt.amountCents,
        token: paymentMethod.token,
        customerId: paymentMethod.customerId,
        ecomind: 'R', // Recurring
        metadata: {
          source: 'autopay',
          autopayAttemptId: attempt.id,
          membershipAccountId: attempt.membershipAccountId,
        },
        clientRequestId: `autopay-${attempt.id}-${Date.now()}`,
      };

      if (isAch) {
        saleInput.paymentMethodType = 'ach';
        saleInput.achSecCode = 'PPD'; // Pre-authorized recurring
        saleInput.achAccountType = paymentMethod.bankAccountType === 'savings' ? 'ESAV' : 'ECHK';
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gatewayResult = await gateway.sale(syntheticCtx as any, saleInput as any);

      // ACH "approved" = accepted for origination, NOT funds received.
      // Mark as 'ach_pending' for ACH, 'success' for cards.
      if (isAch && (gatewayResult.status === 'captured' || gatewayResult.status === 'authorized' || gatewayResult.status === 'ach_pending')) {
        await updateAttemptStatus(tenantId, attempt.id, 'ach_pending', null, gatewayResult.id);
        results.succeeded++;
      } else if (!isAch && (gatewayResult.status === 'captured' || gatewayResult.status === 'authorized')) {
        await updateAttemptStatus(tenantId, attempt.id, 'success', null, gatewayResult.id);
        results.succeeded++;
      } else {
        // Declined or other non-success status
        const msg = gatewayResult.errorMessage ?? `Gateway returned status: ${gatewayResult.status}`;
        await updateAttemptStatus(tenantId, attempt.id, 'failed', msg);
        results.failed++;
        results.errors.push({ attemptId: attempt.id, error: msg });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gateway error';
      await updateAttemptStatus(tenantId, attempt.id, 'failed', msg);
      results.failed++;
      results.errors.push({ attemptId: attempt.id, error: msg });
    }
  }

  // 4. Update run totals if processing a specific run
  if (runId) {
    await updateRunTotals(tenantId, runId);
  }

  return results;
}

async function updateAttemptStatus(
  tenantId: string,
  attemptId: string,
  status: string,
  failureReason: string | null,
  paymentIntentId?: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const updates: Record<string, unknown> = {
      status,
      failureReason,
      updatedAt: new Date(),
    };
    if (paymentIntentId) {
      updates.arTransactionId = paymentIntentId; // store gateway ref for reconciliation
    }

    await tx
      .update(autopayAttempts)
      .set(updates)
      .where(
        and(
          eq(autopayAttempts.tenantId, tenantId),
          eq(autopayAttempts.id, attemptId),
        ),
      );
  });
}

async function updateRunTotals(tenantId: string, runId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    // Count statuses for this run
    const attempts = await tx
      .select({
        status: autopayAttempts.status,
        amountCents: autopayAttempts.amountCents,
      })
      .from(autopayAttempts)
      .where(
        and(
          eq(autopayAttempts.tenantId, tenantId),
          eq(autopayAttempts.runId, runId),
        ),
      );

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let totalCollectedCents = 0;

    for (const a of attempts) {
      if (a.status === 'success') {
        successCount++;
        totalCollectedCents += a.amountCents;
      } else if (a.status === 'failed') {
        failedCount++;
      } else if (a.status === 'skipped') {
        skippedCount++;
      }
    }

    const pendingCount = attempts.filter((a) => a.status === 'pending' || a.status === 'retry').length;
    const isComplete = pendingCount === 0;

    await tx
      .update(autopayRuns)
      .set({
        successCount,
        failedCount,
        skippedCount,
        totalCollectedCents,
        status: isComplete ? 'completed' : 'in_progress',
        completedAt: isComplete ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(autopayRuns.tenantId, tenantId),
          eq(autopayRuns.id, runId),
        ),
      );
  });
}
