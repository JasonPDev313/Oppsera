import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, ne, isNotNull } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, registerTabs, orders } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';

// GET /api/v1/register-tabs/transfers?terminalId=xxx
// Returns tabs from OTHER terminals that have active orders
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
      .select({
        id: registerTabs.id,
        terminalId: registerTabs.terminalId,
        tabNumber: registerTabs.tabNumber,
        orderId: registerTabs.orderId,
        label: registerTabs.label,
        employeeId: registerTabs.employeeId,
        employeeName: registerTabs.employeeName,
        version: registerTabs.version,
        locationId: registerTabs.locationId,
        folioId: registerTabs.folioId,
        guestName: registerTabs.guestName,
        status: registerTabs.status,
        createdAt: registerTabs.createdAt,
        // Order details
        orderNumber: orders.orderNumber,
        subtotal: orders.subtotal,
        taxTotal: orders.taxTotal,
        total: orders.total,
        orderStatus: orders.status,
        orderCreatedAt: orders.createdAt,
        customerId: orders.customerId,
      })
      .from(registerTabs)
      .innerJoin(orders, eq(registerTabs.orderId, orders.id))
      .where(
        and(
          eq(registerTabs.tenantId, ctx.tenantId),
          ne(registerTabs.terminalId, terminalId),
          isNotNull(registerTabs.orderId),
          eq(registerTabs.status, 'active'),
          eq(orders.status, 'open'),
        ),
      )
      .orderBy(registerTabs.terminalId, registerTabs.tabNumber);

    return NextResponse.json({ data: rows });
  },
  { entitlement: 'orders', permission: 'orders.create' },
);
