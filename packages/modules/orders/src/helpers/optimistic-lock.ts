import { eq, sql } from 'drizzle-orm';
import { orders } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import type { InferSelectModel } from 'drizzle-orm';

type Order = InferSelectModel<typeof orders>;

export async function fetchOrderForMutation(
  tx: Database,
  tenantId: string,
  orderId: string,
  requiredStatus: string | string[],
  expectedVersion?: number,
): Promise<Order> {
  // Use raw SQL for SELECT ... FOR UPDATE
  const result = await (tx as any).execute(sql`
    SELECT * FROM orders
    WHERE tenant_id = ${tenantId} AND id = ${orderId}
    FOR UPDATE
  `);
  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  if (rows.length === 0) {
    throw new NotFoundError('Order', orderId);
  }

  const row = rows[0]!;
  const status = row.status as string;
  const version = row.version as number;

  const statuses = Array.isArray(requiredStatus) ? requiredStatus : [requiredStatus];
  if (!statuses.includes(status)) {
    throw new ConflictError(`Order is ${status}, expected ${statuses.join(' or ')}`);
  }

  if (expectedVersion !== undefined && version !== expectedVersion) {
    throw new ConflictError(
      `Order was modified by another session (expected version ${expectedVersion}, found ${version}). Please refresh and retry.`,
    );
  }

  // Map snake_case DB columns to camelCase to match the Drizzle model
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    locationId: row.location_id as string,
    orderNumber: row.order_number as string,
    status: row.status as string,
    source: row.source as string,
    version: row.version as number,
    customerId: (row.customer_id as string) ?? null,
    subtotal: row.subtotal as number,
    taxTotal: row.tax_total as number,
    serviceChargeTotal: row.service_charge_total as number,
    discountTotal: row.discount_total as number,
    roundingAdjustment: row.rounding_adjustment as number,
    total: row.total as number,
    notes: (row.notes as string) ?? null,
    metadata: row.metadata ?? null,
    businessDate: row.business_date as string,
    terminalId: (row.terminal_id as string) ?? null,
    employeeId: (row.employee_id as string) ?? null,
    shiftId: (row.shift_id as string) ?? null,
    receiptSnapshot: row.receipt_snapshot ?? null,
    placedAt: row.placed_at ? new Date(row.placed_at as string) : null,
    paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
    voidedAt: row.voided_at ? new Date(row.voided_at as string) : null,
    voidReason: (row.void_reason as string) ?? null,
    voidedBy: (row.voided_by as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    createdBy: row.created_by as string,
    updatedBy: row.updated_by as string,
  } as Order;
}

export async function incrementVersion(
  tx: Database,
  orderId: string,
): Promise<void> {
  await (tx as any).update(orders)
    .set({ version: sql`version + 1`, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}
