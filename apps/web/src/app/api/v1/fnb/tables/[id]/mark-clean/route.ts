import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { autoProgressTableStatus } from '@oppsera/module-fnb';

/**
 * POST /api/v1/fnb/tables/:id/mark-clean
 *
 * Busser marks a dirty table as available.
 * Transitions: dirty → available
 * Clears all session fields (dirty_since, seated_at, current_tab_id, etc.)
 *
 * Returns:
 *   { data: { progressed: true, oldStatus: 'dirty', newStatus: 'available' } }
 *   or
 *   { data: { progressed: false } } if the table was not in a state that allows this transition
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    // URL: /api/v1/fnb/tables/:id/mark-clean → id is at index -2
    const tableId = parts[parts.length - 2]!;

    const result = await autoProgressTableStatus(ctx, {
      tableId,
      targetStatus: 'available',
      triggeredBy: 'busser_mark_clean',
      clearFields: true,
    });

    return NextResponse.json({ data: result ?? { progressed: false } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage', writeAccess: true },
);
