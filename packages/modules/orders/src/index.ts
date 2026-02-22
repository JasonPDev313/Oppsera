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
  updateOrder,
  voidOrder,
  cloneOrder,
  reopenOrder,
  deleteOrder,
  holdOrder,
  recallOrder,
  setTaxExempt,
  createReturn,
} from './commands';

// Re-export queries
export {
  listOrders,
  getOrder,
  getOrderByNumber,
  listHeldOrders,
  getReturnsByOrder,
} from './queries';
export type { ListOrdersInput, ListOrdersResult, OrderListRow } from './queries/list-orders';
export type { ListHeldOrdersInput, ListHeldOrdersResult, HeldOrderRow } from './queries/list-held-orders';
export type { OrderDetail } from './queries/get-order';
export type { ReturnOrderSummary, ReturnLineSummary } from './queries/get-returns-by-order';

// Re-export validation schemas
export {
  openOrderSchema,
  addLineItemSchema,
  removeLineItemSchema,
  addServiceChargeSchema,
  removeServiceChargeSchema,
  applyDiscountSchema,
  placeOrderSchema,
  updateOrderSchema,
  voidOrderSchema,
  cloneOrderSchema,
  reopenOrderSchema,
  deleteOrderSchema,
  holdOrderSchema,
  recallOrderSchema,
  setTaxExemptSchema,
  createReturnSchema,
} from './validation';
export type {
  OpenOrderInput,
  AddLineItemInput,
  RemoveLineItemInput,
  AddServiceChargeInput,
  RemoveServiceChargeInput,
  ApplyDiscountInput,
  PlaceOrderInput,
  UpdateOrderInput,
  VoidOrderInput,
  CloneOrderInput,
  ReopenOrderInput,
  DeleteOrderInput,
  HoldOrderInput,
  RecallOrderInput,
  SetTaxExemptInput,
  CreateReturnInput,
} from './validation';

// Re-export helpers
export { recalculateOrderTotals } from './helpers';
export type { OrderTotals } from './helpers';
