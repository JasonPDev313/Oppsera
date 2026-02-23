import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, registerTabs } from '@oppsera/db';
import { auditLog } from '@oppsera/core/audit/helpers';
import { ValidationError, NotFoundError, ConflictError, generateUlid } from '@oppsera/shared';

function extractTabId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  // URL: /api/v1/register-tabs/[id]/transfer  → id is at index -2
  return segments[segments.length - 2]!;
}

const transferSchema = z.object({
  targetTerminalId: z.string().min(1),
  targetTabNumber: z.number().int().min(1),
});

// POST /api/v1/register-tabs/:id/transfer — transfer a tab's order to another terminal
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const sourceTabId = extractTabId(request);
    const body = await request.json();
    const parsed = transferSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { targetTerminalId, targetTabNumber } = parsed.data;

    // 1. Fetch source tab
    const [sourceTab] = await db
      .select()
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.id, sourceTabId),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      );

    if (!sourceTab) {
      throw new NotFoundError('Source tab not found');
    }
    if (!sourceTab.orderId) {
      throw new ConflictError('Source tab has no order to transfer');
    }

    const orderId = sourceTab.orderId;

    // 2. Clear orderId from source tab
    await db
      .update(registerTabs)
      .set({ orderId: null, updatedAt: new Date() })
      .where(eq(registerTabs.id, sourceTabId));

    // 3. Find or create target tab on the target terminal
    const [existingTarget] = await db
      .select()
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.tenantId, ctx.tenantId),
          eq(registerTabs.terminalId, targetTerminalId),
          eq(registerTabs.tabNumber, targetTabNumber),
        ),
      );

    if (existingTarget) {
      // Update existing tab with the transferred order
      await db
        .update(registerTabs)
        .set({ orderId, updatedAt: new Date() })
        .where(eq(registerTabs.id, existingTarget.id));
    } else {
      // Create a new tab on the target terminal
      await db.insert(registerTabs).values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        terminalId: targetTerminalId,
        tabNumber: targetTabNumber,
        orderId,
        employeeId: ctx.user.id,
        employeeName: ctx.user.name,
      });
    }

    // 4. Audit log
    await auditLog(ctx, 'register_tab.transferred', 'register_tab', sourceTabId, {
      terminalId: { old: sourceTab.terminalId, new: targetTerminalId },
      tabNumber: { old: sourceTab.tabNumber, new: targetTabNumber },
    }, {
      orderId,
      transferredBy: ctx.user.id,
      transferredByName: ctx.user.name,
    });

    return NextResponse.json({
      data: { orderId, sourceTerminalId: sourceTab.terminalId, targetTerminalId },
    });
  },
  { entitlement: 'orders', permission: 'orders.create', writeAccess: true },
);
