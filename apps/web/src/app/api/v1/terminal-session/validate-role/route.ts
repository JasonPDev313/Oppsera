import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getUserRoleAssignments } from '@oppsera/core/permissions';
import { z } from 'zod';

const bodySchema = z.object({
  roleId: z.string().min(1),
  terminalId: z.string().min(1),
});

// POST /api/v1/terminal-session/validate-role
// Validates that the current user holds the given role and that it is
// compatible with the terminal's location (location-scoped roles must
// match the terminal's location).
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'roleId and terminalId are required' } },
        { status: 400 },
      );
    }

    const { roleId } = parsed.data;
    const assignments = await getUserRoleAssignments(ctx.tenantId, ctx.user.id);
    const match = assignments.find((a) => a.roleId === roleId);

    if (!match) {
      return NextResponse.json(
        { error: { code: 'ROLE_NOT_ASSIGNED', message: 'You do not hold this role' } },
        { status: 403 },
      );
    }

    // Tenant-scoped roles are always valid
    if (match.scope === 'tenant') {
      return NextResponse.json({ data: { valid: true } });
    }

    // Location-scoped: verify the role's location matches the session location
    // The session's locationId is resolved from the JWT/middleware context
    if (match.locationId && ctx.locationId && match.locationId !== ctx.locationId) {
      return NextResponse.json(
        { error: { code: 'LOCATION_MISMATCH', message: `Role is scoped to ${match.locationName ?? 'another location'}` } },
        { status: 403 },
      );
    }

    return NextResponse.json({ data: { valid: true } });
  },
  { entitlement: 'platform_core' },
);
