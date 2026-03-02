import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { users, memberships } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { VerifyManagerPinInput } from '../validation';

const MANAGER_ROLES = ['owner', 'manager', 'supervisor'];

export interface VerifyPinResult {
  verified: boolean;
  userId: string;
  userName: string;
  role: string;
}

/**
 * Verify a manager's PIN for authorizing bulk tab operations.
 *
 * V1: PIN = last 4 digits of user ID (simplified). Replace with real PIN
 * storage when manager PIN infrastructure is built.
 */
export async function verifyManagerPin(
  tenantId: string,
  input: VerifyManagerPinInput,
): Promise<VerifyPinResult> {
  return withTenant(tenantId, async (tx) => {
    // Find users with manager+ role for this tenant
    const managerMemberships = await (tx as any)
      .select({
        userId: memberships.userId,
        role: memberships.role,
        displayName: users.displayName,
        email: users.email,
        pin: users.pin,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, 'active'),
      ));

    // Find a manager whose PIN matches
    for (const m of managerMemberships) {
      if (!MANAGER_ROLES.includes(m.role)) continue;

      // Check PIN — use stored pin if available, fallback to last 4 of userId
      const storedPin = m.pin ?? m.userId.slice(-4);
      if (storedPin === input.pin) {
        return {
          verified: true,
          userId: m.userId,
          userName: m.displayName ?? m.email ?? 'Manager',
          role: m.role,
        };
      }
    }

    throw new AppError('INVALID_PIN', 'Invalid manager PIN', 401);
  });
}
