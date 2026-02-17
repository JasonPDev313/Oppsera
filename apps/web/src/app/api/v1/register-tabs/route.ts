import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, registerTabs } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';
import { auditLog } from '@oppsera/core/audit/helpers';

// GET /api/v1/register-tabs?terminalId=xxx — list tabs for a terminal
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const terminalId = url.searchParams.get('terminalId');

    if (!terminalId) {
      throw new ValidationError('terminalId is required', [
        { field: 'terminalId', message: 'terminalId query parameter is required' },
      ]);
    }

    const rows = await db
      .select()
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.tenantId, ctx.tenantId),
          eq(registerTabs.terminalId, terminalId),
        ),
      )
      .orderBy(asc(registerTabs.tabNumber));

    return NextResponse.json({ data: rows });
  },
  { permission: 'orders.create' },
);

// POST /api/v1/register-tabs — create a new tab
const createTabSchema = z.object({
  terminalId: z.string().min(1),
  tabNumber: z.number().int().min(1),
  label: z.string().max(50).optional(),
  employeeId: z.string().optional(),
  employeeName: z.string().max(100).optional(),
});

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createTabSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { terminalId, tabNumber, label, employeeId, employeeName } = parsed.data;
    const resolvedEmployeeId = employeeId ?? ctx.user.id;
    const resolvedEmployeeName = employeeName ?? ctx.user.name;

    const [row] = await db.insert(registerTabs).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      terminalId,
      tabNumber,
      label: label ?? null,
      orderId: null,
      employeeId: resolvedEmployeeId,
      employeeName: resolvedEmployeeName,
    }).returning();

    await auditLog(ctx, 'register_tab.created', 'register_tab', row!.id, undefined, {
      terminalId,
      tabNumber,
      employeeId: resolvedEmployeeId,
      employeeName: resolvedEmployeeName,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  },
  { permission: 'orders.create' },
);
