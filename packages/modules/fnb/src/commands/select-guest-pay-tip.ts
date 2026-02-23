import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { SelectGuestPayTipInput } from '../validation';

/**
 * Guest selects tip amount. No tenant context — uses token lookup.
 * Operates outside RLS via direct db.execute.
 */
export async function selectGuestPayTip(
  token: string,
  input: SelectGuestPayTipInput,
) {
  return db.transaction(async (tx) => {
    // Lookup session by token (globally unique — no tenant context needed)
    const sessions = await tx.execute(
      sql`SELECT id, tenant_id, status, total_cents, subtotal_cents,
                 tip_settings_snapshot, expires_at
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

    // Validate tip against settings
    const tipSettings = session.tip_settings_snapshot as Record<string, unknown> | null;
    const maxTipAmountCents = (tipSettings?.maxTipAmountCents as number) ?? 100_000;
    const maxTipPercent = (tipSettings?.maxTipPercent as number) ?? 100;
    const calculationBase = (tipSettings?.calculationBase as string) ?? 'subtotal_pre_tax';
    const baseCents = calculationBase === 'subtotal_pre_tax'
      ? (session.subtotal_cents as number)
      : (session.total_cents as number);

    if (input.tipAmountCents > maxTipAmountCents) {
      return { error: 'TIP_EXCEEDS_MAX_AMOUNT' as const };
    }

    if (baseCents > 0) {
      const tipPercent = (input.tipAmountCents / baseCents) * 100;
      if (tipPercent > maxTipPercent) {
        return { error: 'TIP_EXCEEDS_MAX_PERCENT' as const };
      }
    }

    const tipPercentage = baseCents > 0
      ? ((input.tipAmountCents / baseCents) * 100).toFixed(2)
      : '0.00';

    // Update session
    await tx.execute(
      sql`UPDATE guest_pay_sessions
          SET tip_cents = ${input.tipAmountCents},
              tip_percentage = ${tipPercentage}::numeric,
              tip_base_cents = ${baseCents},
              updated_at = NOW()
          WHERE id = ${session.id as string}`,
    );

    // Audit
    const auditId = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, metadata)
          VALUES (${auditId}, ${session.tenant_id as string}, ${session.id as string},
                  'tip_selected', 'guest',
                  ${JSON.stringify({ tipAmountCents: input.tipAmountCents, tipPresetPercent: input.tipPresetPercent ?? null })}::jsonb)`,
    );

    return {
      error: null,
      tipCents: input.tipAmountCents,
      totalWithTipCents: (session.total_cents as number) + input.tipAmountCents,
    };
  });
}
