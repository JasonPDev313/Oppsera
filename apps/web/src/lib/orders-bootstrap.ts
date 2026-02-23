import { setOrdersWriteApi } from '@oppsera/core/helpers/orders-write-api';
import type { OrdersWriteApi } from '@oppsera/core/helpers/orders-write-api';

/**
 * Wire the OrdersWriteApi singleton so PMS and other cross-module
 * consumers can create/update orders without importing @oppsera/module-orders directly.
 */
export async function initializeOrdersWriteApi(): Promise<void> {
  const { openOrder, addLineItem, updateOrder } = await import('@oppsera/module-orders');

  const api: OrdersWriteApi = {
    openOrder: async (ctx, input) => {
      const result = await openOrder(ctx, { ...input, clientRequestId: input.clientRequestId ?? crypto.randomUUID() });
      return {
        id: result.id,
        orderNumber: result.orderNumber,
        status: result.status,
        version: result.version,
      };
    },

    addLineItem: async (ctx, orderId, input) => {
      return addLineItem(ctx, orderId, { ...input, clientRequestId: input.clientRequestId ?? crypto.randomUUID() });
    },

    updateOrder: async (ctx, orderId, input) => {
      return updateOrder(ctx, orderId, { ...input, clientRequestId: input.clientRequestId ?? crypto.randomUUID() });
    },
  };

  setOrdersWriteApi(api);
}
