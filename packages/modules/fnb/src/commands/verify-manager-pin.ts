import { eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { users, memberships, roleAssignments, roles } from '@oppsera/db';
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
    // Find active members with manager+ roles via roleAssignments → roles
    const managerRows = await (tx as any)
      .select({
        userId: memberships.userId,
        roleName: roles.name,
        displayName: users.displayName,
        email: users.email,
        overridePin: users.overridePin,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .innerJoin(roleAssignments, and(
        eq(roleAssignments.tenantId, memberships.tenantId),
        eq(roleAssignments.userId, memberships.userId),
      ))
      .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
      .where(and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, 'active'),
        inArray(roles.name, MANAGER_ROLES),
      ));

    // Find a manager whose PIN matches
    for (const m of managerRows) {
      // Check PIN — use stored overridePin if available, fallback to last 4 of userId
      const storedPin = m.overridePin ?? m.userId.slice(-4);
      if (storedPin === input.pin) {
        return {
          verified: true,
          userId: m.userId,
          userName: m.displayName ?? m.email ?? 'Manager',
          role: m.roleName,
        };
      }
    }

    throw new AppError('INVALID_PIN', 'Invalid manager PIN', 401);
  });
}
