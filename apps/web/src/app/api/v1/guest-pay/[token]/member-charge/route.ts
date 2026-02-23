import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core';
import { chargeMemberAccount, chargeMemberAccountSchema } from '@oppsera/module-fnb';
import { recordArTransaction } from '@oppsera/module-customers';
import { getSessionInternalByToken } from '@/lib/guest-pay-member-lookup';

/**
 * Build a synthetic RequestContext for guest pay AR transactions.
 * Guests have no auth session, so we create a system-level context.
 */
function buildGuestPayCtx(tenantId: string, locationId?: string): RequestContext {
  return {
    user: {
      id: 'system:guest-pay',
      email: '',
      name: 'Guest Pay System',
      tenantId,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    tenantId,
    locationId,
    requestId: `guest-pay-${generateUlid()}`,
    isPlatformAdmin: false,
  };
}

/**
 * POST /api/v1/guest-pay/:token/member-charge
 * Both paths: execute the house account charge.
 * Path A: session has memberId (no verification needed).
 * Path B: verificationId provided (must be verified).
 */
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const token = segments[segments.length - 2]!; // before /member-charge

    const body = await request.json();
    const parsed = chargeMemberAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Get session
    const session = await getSessionInternalByToken(token);
    if (!session || session.status !== 'active') {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        expired: 410,
      };
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_ACTIVE', message: 'Session not found or not active' } },
        { status: session ? (statusMap[session.status] ?? 409) : 404 },
      );
    }

    if (session.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: { code: 'SESSION_EXPIRED', message: 'Session has expired' } },
        { status: 410 },
      );
    }

    // Determine member identity
    let memberId: string;
    let billingAccountId: string;
    let memberDisplayName: string;

    if (session.memberId && session.billingAccountId) {
      // Path A: tab linked to member — use session's member info
      memberId = session.memberId;
      billingAccountId = session.billingAccountId;
      memberDisplayName = session.memberDisplayName ?? 'Member';
    } else if (parsed.data.verificationId) {
      // Path B: verified via email 2FA
      const verifications = await db.execute(
        sql`SELECT customer_id, billing_account_id, member_display_name, status, expires_at
            FROM guest_pay_member_verifications
            WHERE id = ${parsed.data.verificationId} AND session_id = ${session.id}`,
      );
      const vRows = Array.from(verifications as Iterable<Record<string, unknown>>);
      if (vRows.length === 0) {
        return NextResponse.json(
          { error: { code: 'VERIFICATION_NOT_FOUND', message: 'Verification not found' } },
          { status: 404 },
        );
      }

      const v = vRows[0]!;
      if (v.status !== 'verified') {
        return NextResponse.json(
          { error: { code: 'NOT_VERIFIED', message: 'Verification is not complete' } },
          { status: 403 },
        );
      }

      const vExpires = new Date(v.expires_at as string);
      if (vExpires <= new Date()) {
        return NextResponse.json(
          { error: { code: 'VERIFICATION_EXPIRED', message: 'Verification has expired. Please start again.' } },
          { status: 410 },
        );
      }

      memberId = v.customer_id as string;
      billingAccountId = v.billing_account_id as string;
      memberDisplayName = v.member_display_name as string;
    } else {
      return NextResponse.json(
        { error: { code: 'NO_MEMBER_AUTH', message: 'No member authentication provided' } },
        { status: 403 },
      );
    }

    // Pre-charge validation: check credit limit
    const baRows = await db.execute(
      sql`SELECT credit_limit_cents, current_balance_cents, status
          FROM billing_accounts WHERE id = ${billingAccountId}`,
    );
    const baArr = Array.from(baRows as Iterable<Record<string, unknown>>);
    if (baArr.length === 0) {
      return NextResponse.json(
        { error: { code: 'ACCOUNT_NOT_FOUND', message: 'Billing account not found' } },
        { status: 404 },
      );
    }

    const ba = baArr[0]!;
    if (ba.status !== 'active') {
      return NextResponse.json(
        { error: { code: 'ACCOUNT_SUSPENDED', message: 'This account is not active' } },
        { status: 403 },
      );
    }

    const creditLimitCents = ba.credit_limit_cents != null ? Number(ba.credit_limit_cents) : null;
    const currentBalanceCents = Number(ba.current_balance_cents ?? 0);
    const totalChargeCents = session.totalCents + parsed.data.tipAmountCents;

    if (creditLimitCents != null && (currentBalanceCents + totalChargeCents) > creditLimitCents) {
      return NextResponse.json(
        { error: { code: 'CREDIT_LIMIT_EXCEEDED', message: 'This charge would exceed the account credit limit' } },
        { status: 422 },
      );
    }

    // Execute the charge: marks session paid, closes tab, inserts payment attempt
    const chargeResult = await chargeMemberAccount(token, {
      tipAmountCents: parsed.data.tipAmountCents,
      memberId,
      billingAccountId,
      memberDisplayName,
    });

    if (chargeResult.error) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        SESSION_EXPIRED: 410,
        SESSION_NOT_ACTIVE: 409,
      };
      return NextResponse.json(
        { error: { code: chargeResult.error, message: chargeResult.error } },
        { status: statusMap[chargeResult.error] ?? 400 },
      );
    }

    // Create AR transaction (cross-module — web app is orchestration layer)
    // Follows "never block POS" pattern: if AR fails, log but don't roll back
    try {
      const ctx = buildGuestPayCtx(chargeResult.tenantId!, chargeResult.locationId);
      await recordArTransaction(ctx, {
        billingAccountId,
        type: 'charge',
        amountCents: totalChargeCents,
        customerId: memberId,
        referenceType: 'guest_pay_session',
        referenceId: chargeResult.sessionId!,
        notes: `Guest Pay charge — ${session.tableNumber ? `Table ${session.tableNumber}` : 'QR Payment'}`,
      });
    } catch (err) {
      console.error('[guest-pay] AR transaction failed (session already paid, not rolling back)', {
        sessionId: chargeResult.sessionId,
        memberId,
        billingAccountId,
        totalChargeCents,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({
      data: {
        status: 'paid',
        amountCents: chargeResult.amountCents,
        tipCents: chargeResult.tipCents,
        memberDisplayName,
        paymentMethod: 'member_charge',
      },
    });
  },
  { public: true },
);
