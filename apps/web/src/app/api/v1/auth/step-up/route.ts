import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { verifySecret } from '@oppsera/core/users';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, createStepUpToken } from '@oppsera/core/security';
import { ValidationError, STEP_UP_CATEGORIES } from '@oppsera/shared';
import type { StepUpCategory } from '@oppsera/shared';
import { db, userSecurity, users, roleAssignments, rolePermissions } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';

const stepUpSchema = z.object({
  pin: z.string().min(4).max(8),
  category: z.enum(
    Object.keys(STEP_UP_CATEGORIES) as [StepUpCategory, ...StepUpCategory[]],
  ),
});

/**
 * POST /api/v1/auth/step-up
 *
 * Verify a user's PIN and issue a signed step-up token for the requested category.
 * Rate limited: 5 attempts per minute per tenant.
 *
 * Body: { pin: string, category: StepUpCategory }
 * Returns: { data: { token, category, expiresAt, verifiedBy } }
 */
export const POST = withMiddleware(
  async (request, ctx) => {
    // Rate limit: 5 attempts per minute per tenant
    const rlKey = getRateLimitKey(request, `step-up:${ctx.tenantId}`);
    const rl = checkRateLimit(rlKey, { maxRequests: 5, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many PIN attempts. Please wait.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json();
    const parsed = stepUpSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })));
    }

    const { pin, category } = parsed.data;

    // Find all users in this tenant who have a POS override PIN set
    const secRows = await db
      .select({
        userId: userSecurity.userId,
        pinHash: userSecurity.posOverridePinHash,
      })
      .from(userSecurity)
      .innerJoin(users, eq(users.id, userSecurity.userId))
      .where(eq(users.tenantId, ctx.tenantId));

    // Check each user's PIN
    for (const row of secRows) {
      if (!row.pinHash) continue;
      const match = verifySecret(pin, row.pinHash);
      if (!match) continue;

      // PIN matched — check that the verifier has the relevant permission
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
      // Owner (*) or accounting.* can step-up for financial_critical/bulk_operations
      // permissions.* can step-up for permission_mgmt
      const hasAccess = permSet.has('*') || permSet.has('accounting.*') || permSet.has('accounting.settings');
      if (!hasAccess) continue;

      // Fetch user name for audit
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.userId));

      // Issue signed step-up token for the requesting user (not the verifier)
      const { token, expiresAt } = createStepUpToken(
        ctx.user.id,
        ctx.tenantId,
        category,
        row.userId,
      );

      return NextResponse.json({
        data: {
          token,
          category,
          expiresAt,
          verifiedBy: u?.name ?? 'Unknown',
        },
      });
    }

    // No valid PIN match found
    return NextResponse.json(
      { error: { code: 'INVALID_PIN', message: 'Invalid PIN or insufficient permissions.' } },
      { status: 401 },
    );
  },
  { authenticated: true },
);
