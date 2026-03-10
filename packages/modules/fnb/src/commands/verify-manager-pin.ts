import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { users, memberships, roleAssignments, roles, userSecurity } from '@oppsera/db';
import { verifySecret } from '@oppsera/core/users';
import type { VerifyManagerPinInput } from '../validation';

const MANAGER_ROLES = ['owner', 'manager', 'supervisor'];

export type VerifyPinResult =
  | { verified: true; userId: string; userName: string; role: string }
  | { verified: false; userId: ''; userName: ''; role: '' };

/**
 * Verify a manager's POS override PIN for authorizing bulk tab operations.
 * Uses hashed PINs from user_security table with timing-safe comparison.
 */
export async function verifyManagerPin(
  tenantId: string,
  input: VerifyManagerPinInput,
): Promise<VerifyPinResult> {
  return withTenant(tenantId, async (tx) => {
    // Find active members with manager+ roles who have override PINs set
    const managerRows = await tx
      .select({
        userId: memberships.userId,
        roleName: roles.name,
        displayName: users.displayName,
        email: users.email,
        pinHash: userSecurity.posOverridePinHash,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .innerJoin(roleAssignments, and(
        eq(roleAssignments.tenantId, memberships.tenantId),
        eq(roleAssignments.userId, memberships.userId),
      ))
      .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
      .innerJoin(userSecurity, eq(userSecurity.userId, memberships.userId))
      .where(and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, 'active'),
        inArray(roles.name, MANAGER_ROLES),
        isNotNull(userSecurity.posOverridePinHash),
      ));

    // Verify against each manager's hashed PIN (timing-safe)
    for (const m of managerRows) {
      if (!m.pinHash) continue;
      if (!verifySecret(input.pin, m.pinHash)) continue;

      return {
        verified: true,
        userId: m.userId,
        userName: m.displayName ?? m.email ?? 'Manager',
        role: m.roleName,
      };
    }

    // Return a structured failure — do NOT throw. Throwing causes apiFetch to
    // see a 401 and trigger a spurious token-refresh cycle on every wrong PIN.
    return { verified: false, userId: '', userName: '', role: '' };
  });
}
