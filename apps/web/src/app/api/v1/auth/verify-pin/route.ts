import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { verifySecret } from '@oppsera/core/users';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';
import { ValidationError } from '@oppsera/shared';
import { db, userSecurity, users, roleAssignments, rolePermissions } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';

const verifyPinSchema = z.object({
  pin: z.string().min(4).max(8),
  requiredPermission: z.string().optional(),
});

/** Manager/Supervisor/Owner users with a POS override PIN. Rate-limited 5/min. */
export const POST = withMiddleware(
  async (request, ctx) => {
    // Rate limit: 5 attempts per minute per tenant
    const rlKey = getRateLimitKey(request, `verify-pin:${ctx.tenantId}`);
    const rl = checkRateLimit(rlKey, { maxRequests: 5, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many PIN attempts. Please wait.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json();
    const parsed = verifyPinSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })));
    }

    const { pin, requiredPermission } = parsed.data;

    // Find all users in this tenant who have a POS override PIN set
    const secRows = await db
      .select({
        userId: userSecurity.userId,
        pinHash: userSecurity.posOverridePinHash,
      })
      .from(userSecurity)
      .innerJoin(users, eq(users.id, userSecurity.userId))
      .where(and(
        eq(users.tenantId, ctx.tenantId),
      ));

    // Check each user's PIN
    for (const row of secRows) {
      if (!row.pinHash) continue;
      const match = verifySecret(pin, row.pinHash);
      if (!match) continue;

      // PIN matched — check if user has required permission (if specified)
      if (requiredPermission) {
        const userRoleRows = await db
          .select({ roleId: roleAssignments.roleId })
          .from(roleAssignments)
          .where(and(
            eq(roleAssignments.tenantId, ctx.tenantId),
            eq(roleAssignments.userId, row.userId),
          ));

        const roleIds = userRoleRows.map((r) => r.roleId);
        if (roleIds.length === 0) continue;

        const perms = await db
          .select({ permission: rolePermissions.permission })
          .from(rolePermissions)
          .where(inArray(rolePermissions.roleId, roleIds));

        const permSet = new Set(perms.map((p) => p.permission));
        const hasAccess = permSet.has('*') || permSet.has(requiredPermission) ||
          permSet.has(requiredPermission.split('.')[0] + '.*');

        if (!hasAccess) continue;
      }

      // Fetch user name for audit
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.userId));

      return NextResponse.json({
        data: { verified: true, userId: row.userId, userName: u?.name ?? 'Unknown' },
      });
    }

    return NextResponse.json({
      data: { verified: false },
    });
  },
  { entitlement: 'orders', permission: 'orders.create' },
);
