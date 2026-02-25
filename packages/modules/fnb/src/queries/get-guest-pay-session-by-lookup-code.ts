import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';

/**
 * Public lookup by human-readable check code.
 * Returns the token if found and active, so the frontend can redirect to /pay/[token].
 * Case-insensitive. Lazily expires if past TTL.
 */
export async function getGuestPaySessionByLookupCode(code: string) {
  const normalizedCode = code.toUpperCase().trim();

  const sessions = await db.execute(
    sql`SELECT id, token, status, expires_at, restaurant_name, table_number
        FROM guest_pay_sessions
        WHERE UPPER(lookup_code) = ${normalizedCode}
          AND status = 'active'`,
  );

  const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
  if (rows.length === 0) return null;

  const s = rows[0]!;
  const expiresAt = new Date(s.expires_at as string);

  // Lazily expire if past TTL
  if (expiresAt <= new Date()) {
    await db.execute(
      sql`UPDATE guest_pay_sessions SET status = 'expired', updated_at = NOW()
          WHERE id = ${s.id as string} AND status = 'active'`,
    );
    return { expired: true as const };
  }

  return {
    expired: false as const,
    token: s.token as string,
    restaurantName: (s.restaurant_name as string) ?? null,
    tableNumber: (s.table_number as string) ?? null,
  };
}
