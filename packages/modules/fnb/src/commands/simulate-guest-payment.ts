import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { SimulateGuestPaymentInput } from '../validation';

/**
 * V1 simulated payment. Marks session paid, inserts attempt,
 * closes tab. No real tender — clean for accounting in V2.
 * Operates outside RLS via direct db.execute (guest has no tenant context).
 */
export async function simulateGuestPayment(
  token: string,
  input: SimulateGuestPaymentInput,
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
    const tenantId = session.tenant_id as string;
    const totalCents = session.total_cents as number;
    const tipCents = input.tipAmountCents;

    // Insert payment attempt (simulated)
    const attemptId = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_payment_attempts
            (id, tenant_id, session_id, amount_cents, tip_cents, status, payment_method)
          VALUES (${attemptId}, ${tenantId}, ${sessionId},
                  ${totalCents}, ${tipCents}, 'simulated', 'simulated')`,
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

    // Close the tab (V1: direct close without creating real tenders)
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'paid', updated_at = NOW(), version = version + 1
          WHERE id = ${session.tab_id as string} AND tenant_id = ${tenantId}`,
    );

    // Audit
    const auditId = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, metadata)
          VALUES (${auditId}, ${tenantId}, ${sessionId},
                  'payment_simulated', 'guest',
                  ${JSON.stringify({ amountCents: totalCents, tipCents, paymentMethod: 'simulated' })}::jsonb)`,
    );

    return {
      error: null,
      sessionId,
      tabId: session.tab_id as string,
      amountCents: totalCents,
      tipCents,
      status: 'paid' as const,
    };
  });
}
