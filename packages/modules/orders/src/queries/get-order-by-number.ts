import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orders } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { getOrder } from './get-order';

export async function getOrderByNumber(
  tenantId: string,
  locationId: string,
  orderNumber: string,
) {
  return withTenant(tenantId, async (tx) => {
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.locationId, locationId),
          eq(orders.orderNumber, orderNumber),
        ),
      )
      .limit(1);

    if (!order) {
      throw new NotFoundError('Order', orderNumber);
    }

    return getOrder(tenantId, order.id);
  });
}
