import { createHash, randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { sendEmail, memberVerificationEmail } from '@oppsera/core';
import { ValidationError, generateUlid } from '@oppsera/shared';
import { guestPayMemberAuthSchema } from '@oppsera/module-fnb';
import { getSessionInternalByToken, lookupMemberForGuestPay } from '@/lib/guest-pay-member-lookup';

/**
 * POST /api/v1/guest-pay/:token/member-auth
 * Path B Step 1: guest enters member number + phone last 4.
 * Validates member, sends 6-digit email verification code.
 */
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const token = segments[segments.length - 2]!; // before /member-auth

    const body = await request.json();
    const parsed = guestPayMemberAuthSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Get session
    const session = await getSessionInternalByToken(token);
    if (!session || session.status !== 'active') {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_ACTIVE', message: 'Session not found or not active' } },
        { status: session ? 409 : 404 },
      );
    }

    // Check if expired
    if (session.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: { code: 'SESSION_EXPIRED', message: 'Session has expired' } },
        { status: 410 },
      );
    }

    // Rate limit: max 5 auth attempts per session per 15 min
    const recentAttempts = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM guest_pay_audit_log
          WHERE session_id = ${session.id}
            AND action = 'member_auth_attempted'
            AND created_at > NOW() - INTERVAL '15 minutes'`,
    );
    const attemptRows = Array.from(recentAttempts as Iterable<Record<string, unknown>>);
    const attemptCount = Number(attemptRows[0]?.cnt ?? 0);
    if (attemptCount >= 5) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' } },
        { status: 429 },
      );
    }

    // Lookup member
    const member = await lookupMemberForGuestPay(
      session.tenantId,
      parsed.data.memberNumber,
      parsed.data.phoneLast4,
    );

    // Audit (always — success or failure)
    const auditId = generateUlid();
    await db.execute(
      sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, metadata)
          VALUES (${auditId}, ${session.tenantId}, ${session.id},
                  'member_auth_attempted', 'guest',
                  ${JSON.stringify({ success: !!member, memberNumber: parsed.data.memberNumber })}::jsonb)`,
    );

    if (!member) {
      return NextResponse.json(
        { error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found. Check your member number and phone number.' } },
        { status: 404 },
      );
    }

    if (!member.email) {
      return NextResponse.json(
        { error: { code: 'NO_EMAIL_ON_FILE', message: 'No email address on file for this member. Please see your server.' } },
        { status: 422 },
      );
    }

    // Generate 6-digit code
    const code = String(randomInt(100000, 999999));
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Expire any existing pending verifications for this session
    await db.execute(
      sql`UPDATE guest_pay_member_verifications
          SET status = 'expired'
          WHERE session_id = ${session.id} AND status = 'pending'`,
    );

    // Insert verification row
    const verificationId = generateUlid();
    await db.execute(
      sql`INSERT INTO guest_pay_member_verifications
            (id, tenant_id, session_id, customer_id, billing_account_id,
             member_display_name, code_hash, email_sent_to, status, expires_at)
          VALUES (${verificationId}, ${session.tenantId}, ${session.id},
                  ${member.customerId}, ${member.billingAccountId},
                  ${member.displayName}, ${codeHash}, ${member.email},
                  'pending', ${expiresAt.toISOString()}::timestamptz)`,
    );

    // Send email
    const tableLabel = session.tableNumber ? `Table ${session.tableNumber}` : '';
    const { subject, html } = memberVerificationEmail(
      code,
      session.restaurantName ?? 'the restaurant',
      tableLabel,
    );

    try {
      await sendEmail(member.email, subject, html);
    } catch (err) {
      console.error('[guest-pay] Failed to send verification email', err);
      // Don't block — code was inserted, guest can ask for resend
    }

    // Mask email for frontend display
    const emailParts = member.email.split('@');
    const emailHint = emailParts[0]!.charAt(0) + '***@' + emailParts[1];

    return NextResponse.json({
      data: {
        verificationId,
        emailHint,
        displayName: member.displayName,
      },
    });
  },
  { public: true },
);
