import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { ChargeMemberAccountInput } from '../validation';

/**
 * Charge a guest pay session to a member's house account.
 * Mirrors `simulateGuestPayment` but with real member charge semantics.
 * Operates outside RLS via direct db.execute (guest has no tenant context).
 *
 * The AR transaction is created by the API route layer (cross-module boundary),
 * not here. This command handles: session → paid, tab → paid, payment attempt, audit.
 */
export async function chargeMemberAccount(
  token: string,
  input: ChargeMemberAccountInput & {
    memberId: string;
    billingAccountId: string;
    memberDisplayName: string;
    clientRequestId?: string;
  },
) {
  return db.transaction(async (tx) => {
    // Lookup session by token
    const sessions = await tx.execute(
      sql`SELECT id, tenant_id, tab_id, order_id, location_id,
                 status, total_cents, tip_cents, expires_at
          FROM guest_pay_sessions
          WHERE token = ${token}
          FOR UPDATE`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) {
      return { error: 'SESSION_NOT_FOUND' as const };
    }

    const session = rows[0]!;
    const tenantIdFromSession = session.tenant_id as string;

    // Idempotency check — uses tenantId from session since there is no RequestContext
    // Cast tx to any: db.transaction() returns PgTransaction (no $client), but checkIdempotency
    // internally casts to any as well — safe at runtime.
    const idempotencyCheck = await checkIdempotency(tx as any, tenantIdFromSession, input.clientRequestId, 'chargeMemberAccount');
    if (idempotencyCheck.isDuplicate) return idempotencyCheck.originalResult as any;

    const status = session.status as string;
    const expiresAt = new Date(session.expires_at as string);

    // Check expired
    if (status === 'active' && expiresAt <= new Date()) {
      await tx.execute(
        sql`UPDATE guest_pay_sessions SET status = 'expired', updated_at = NOW()
            WHERE id = ${session.id as string}`,
      );
      return { error: 'SESSION_EXPIRED' as const };
    }

    if (status !== 'active') {
      return { error: 'SESSION_NOT_ACTIVE' as const, status };
    }

    const sessionId = session.id as string;
    const tenantId = tenantIdFromSession;
    const locationId = session.location_id as string;
    const totalCents = session.total_cents as number;
    const tipCents = input.tipAmountCents;

    // Insert payment attempt (member charge)
    const attemptId = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_payment_attempts
            (id, tenant_id, session_id, amount_cents, tip_cents, status,
             payment_method, member_id, billing_account_id, member_display_name)
          VALUES (${attemptId}, ${tenantId}, ${sessionId},
                  ${totalCents}, ${tipCents}, 'succeeded', 'member_charge',
                  ${input.memberId}, ${input.billingAccountId}, ${input.memberDisplayName})`,
    );

    // Mark session as paid
    await tx.execute(
      sql`UPDATE guest_pay_sessions
          SET status = 'paid',
              paid_at = NOW(),
              tip_cents = ${tipCents},
              updated_at = NOW()
          WHERE id = ${sessionId}`,
    );

    // Close the tab
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'paid', updated_at = NOW(), version = version + 1
          WHERE id = ${session.tab_id as string} AND tenant_id = ${tenantId}`,
    );

    // Audit
    const auditId = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, actor_id, metadata)
          VALUES (${auditId}, ${tenantId}, ${sessionId},
                  'member_charge_succeeded', 'member', ${input.memberId},
                  ${JSON.stringify({
                    amountCents: totalCents,
                    tipCents,
                    paymentMethod: 'member_charge',
                    memberId: input.memberId,
                    billingAccountId: input.billingAccountId,
                    memberDisplayName: input.memberDisplayName,
                  })}::jsonb)`,
    );

    const resultPayload = {
      error: null,
      sessionId,
      tabId: session.tab_id as string,
      orderId: (session.order_id as string) ?? null,
      tenantId,
      locationId,
      amountCents: totalCents,
      tipCents,
      status: 'paid' as const,
    };

    await saveIdempotencyKey(tx as any, tenantId, input.clientRequestId, 'chargeMemberAccount', resultPayload);

    return resultPayload;
  });
}
