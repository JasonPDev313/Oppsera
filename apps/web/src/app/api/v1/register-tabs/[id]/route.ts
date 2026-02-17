import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, registerTabs } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { auditLog } from '@oppsera/core/audit/helpers';

function extractTabId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// PATCH /api/v1/register-tabs/[id] — update a tab (orderId, label)
const updateTabSchema = z.object({
  orderId: z.string().nullable().optional(),
  label: z.string().max(50).nullable().optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().max(100).optional(),
});

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractTabId(request);
    const body = await request.json();
    const parsed = updateTabSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.orderId !== undefined) updates.orderId = parsed.data.orderId;
    if (parsed.data.label !== undefined) updates.label = parsed.data.label;
    if (parsed.data.employeeId !== undefined) updates.employeeId = parsed.data.employeeId;
    if (parsed.data.employeeName !== undefined) updates.employeeName = parsed.data.employeeName;

    // If server is changing, fetch old values for audit
    let oldEmployeeId: string | null = null;
    let oldEmployeeName: string | null = null;
    if (parsed.data.employeeId !== undefined) {
      const [current] = await db
        .select({
          employeeId: registerTabs.employeeId,
          employeeName: registerTabs.employeeName,
        })
        .from(registerTabs)
        .where(and(eq(registerTabs.id, id), eq(registerTabs.tenantId, ctx.tenantId)));
      if (current) {
        oldEmployeeId = current.employeeId;
        oldEmployeeName = current.employeeName;
      }
    }

    const [row] = await db
      .update(registerTabs)
      .set(updates)
      .where(
        and(
          eq(registerTabs.id, id),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Tab not found');
    }

    // Audit server change
    if (parsed.data.employeeId !== undefined && parsed.data.employeeId !== oldEmployeeId) {
      await auditLog(ctx, 'register_tab.server_changed', 'register_tab', id, {
        employeeId: { old: oldEmployeeId, new: parsed.data.employeeId },
        employeeName: { old: oldEmployeeName, new: parsed.data.employeeName ?? null },
      }, {
        changedBy: ctx.user.id,
        changedByName: ctx.user.name,
      });
    }

    return NextResponse.json({ data: row });
  },
  { permission: 'orders.create' },
);

// DELETE /api/v1/register-tabs/[id] — delete a tab
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractTabId(request);

    const [row] = await db
      .delete(registerTabs)
      .where(
        and(
          eq(registerTabs.id, id),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Tab not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { permission: 'orders.create' },
);
