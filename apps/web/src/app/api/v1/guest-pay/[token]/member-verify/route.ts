import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { guestPayMemberVerifySchema } from '@oppsera/module-fnb';

/**
 * POST /api/v1/guest-pay/:token/member-verify
 * Path B Step 2: guest enters the 6-digit code from their email.
 */
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const body = await request.json();
    const parsed = guestPayMemberVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { verificationId, code } = parsed.data;

    // Lookup verification with FOR UPDATE
    const verifications = await db.execute(
      sql`SELECT id, tenant_id, session_id, customer_id, billing_account_id,
                 member_display_name, code_hash, status, attempts_remaining, expires_at
          FROM guest_pay_member_verifications
          WHERE id = ${verificationId}
          FOR UPDATE`,
    );
    const rows = Array.from(verifications as Iterable<Record<string, unknown>>);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'VERIFICATION_NOT_FOUND', message: 'Verification not found' } },
        { status: 404 },
      );
    }

    const v = rows[0]!;
    const status = v.status as string;
    const expiresAt = new Date(v.expires_at as string);
    const attemptsRemaining = v.attempts_remaining as number;

    // Check expired
    if (status !== 'pending' || expiresAt <= new Date()) {
      if (status === 'pending') {
        await db.execute(
          sql`UPDATE guest_pay_member_verifications SET status = 'expired'
              WHERE id = ${verificationId}`,
        );
      }
      return NextResponse.json(
        { error: { code: 'CODE_EXPIRED', message: 'This code has expired. Please request a new one.' } },
        { status: 410 },
      );
    }

    // Verify code
    const candidateHash = createHash('sha256').update(code).digest('hex');
    const storedHash = v.code_hash as string;

    if (candidateHash !== storedHash) {
      const newAttempts = attemptsRemaining - 1;

      if (newAttempts <= 0) {
        await db.execute(
          sql`UPDATE guest_pay_member_verifications
              SET status = 'failed', attempts_remaining = 0
              WHERE id = ${verificationId}`,
        );
        return NextResponse.json(
          { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Please request a new code.' } },
          { status: 403 },
        );
      }

      await db.execute(
        sql`UPDATE guest_pay_member_verifications
            SET attempts_remaining = ${newAttempts}
            WHERE id = ${verificationId}`,
      );

      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CODE',
            message: 'Incorrect code. Please try again.',
            attemptsRemaining: newAttempts,
          },
        },
        { status: 400 },
      );
    }

    // Code matches — mark verified
    await db.execute(
      sql`UPDATE guest_pay_member_verifications
          SET status = 'verified', verified_at = NOW()
          WHERE id = ${verificationId}`,
    );

    // Look up available credit for the response
    const billingAccountId = v.billing_account_id as string;
    const baRows = await db.execute(
      sql`SELECT credit_limit_cents, current_balance_cents
          FROM billing_accounts WHERE id = ${billingAccountId}`,
    );
    const baArr = Array.from(baRows as Iterable<Record<string, unknown>>);
    const ba = baArr[0];

    const creditLimitCents = ba?.credit_limit_cents != null ? Number(ba.credit_limit_cents) : null;
    const currentBalanceCents = Number(ba?.current_balance_cents ?? 0);
    const availableCreditCents = creditLimitCents != null
      ? Math.max(0, creditLimitCents - currentBalanceCents)
      : null;

    return NextResponse.json({
      data: {
        memberId: v.customer_id as string,
        displayName: v.member_display_name as string,
        billingAccountId,
        availableCreditCents,
      },
    });
  },
  { public: true },
);
