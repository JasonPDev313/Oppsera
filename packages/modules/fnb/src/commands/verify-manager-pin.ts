import { eq, and, isNotNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { users, memberships, userSecurity } from '@oppsera/db';
import { verifySecret } from '@oppsera/core/users';
import type { VerifyManagerPinInput } from '../validation';

export type VerifyPinResult =
  | { verified: true; userId: string; userName: string; role: string }
  | { verified: false; userId: ''; userName: ''; role: ''; reason: 'wrong_pin' | 'no_eligible_manager' };

/**
 * Verify a POS override PIN for authorizing bulk tab operations.
 * Any active member with a posOverridePinHash set is eligible — having the
 * PIN configured IS the authorization (no role gate).
 * Uses hashed PINs from user_security table with timing-safe comparison.
 */
export async function verifyManagerPin(
  tenantId: string,
  input: VerifyManagerPinInput,
): Promise<VerifyPinResult> {
  return withTenant(tenantId, async (tx) => {
    // Find active members who have an override PIN set (no role filter —
    // configuring a PIN for a user IS the authorization to use it)
    const pinRows = await tx
      .select({
        userId: memberships.userId,
        displayName: users.displayName,
        email: users.email,
        pinHash: userSecurity.posOverridePinHash,
        primaryRoleId: users.primaryRoleId,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .innerJoin(userSecurity, eq(userSecurity.userId, memberships.userId))
      .where(and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, 'active'),
        isNotNull(userSecurity.posOverridePinHash),
      ));

    // No users with a PIN configured — distinct from wrong PIN
    if (pinRows.length === 0) {
      return { verified: false, userId: '', userName: '', role: '', reason: 'no_eligible_manager' };
    }

    // Verify against each user's hashed PIN (timing-safe)
    for (const m of pinRows) {
      if (!m.pinHash) continue;
      if (!verifySecret(input.pin, m.pinHash)) continue;

      return {
        verified: true,
        userId: m.userId,
        userName: m.displayName ?? m.email ?? 'Manager',
        role: m.primaryRoleId ?? 'unknown',
      };
    }

    // Return a structured failure — do NOT throw. Throwing causes apiFetch to
    // see a 401 and trigger a spurious token-refresh cycle on every wrong PIN.
    return { verified: false, userId: '', userName: '', role: '', reason: 'wrong_pin' };
  });
}
