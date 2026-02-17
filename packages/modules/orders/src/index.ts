export const MODULE_KEY = 'orders' as const;
export const MODULE_NAME = 'Retail POS Orders';
export const MODULE_VERSION = '1.0.0';

// Re-export event contracts (side-effect import)
import './events/contracts';

// Re-export commands
export {
  openOrder,
  addLineItem,
  removeLineItem,
  addServiceCharge,
  removeServiceCharge,
  applyDiscount,
  placeOrder,
  voidOrder,
} from './commands';

// Re-export queries
export {
  listOrders,
  getOrder,
  getOrderByNumber,
} from './queries';
export type { ListOrdersInput, ListOrdersResult } from './queries/list-orders';
export type { OrderDetail } from './queries/get-order';

// Re-export validation schemas
export {
  openOrderSchema,
  addLineItemSchema,
  removeLineItemSchema,
  addServiceChargeSchema,
  removeServiceChargeSchema,
  applyDiscountSchema,
  placeOrderSchema,
  voidOrderSchema,
} from './validation';
export type {
  OpenOrderInput,
  AddLineItemInput,
  RemoveLineItemInput,
  AddServiceChargeInput,
  RemoveServiceChargeInput,
  ApplyDiscountInput,
  PlaceOrderInput,
  VoidOrderInput,
} from './validation';

// Re-export helpers
export { recalculateOrderTotals } from './helpers';
export type { OrderTotals } from './helpers';
