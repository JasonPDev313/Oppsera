import { registerContracts } from '@oppsera/core/events/contracts';
import {
  OrderOpenedDataSchema,
  OrderLineAddedDataSchema,
  OrderLineRemovedDataSchema,
  OrderServiceChargeAddedDataSchema,
  OrderServiceChargeRemovedDataSchema,
  OrderDiscountAppliedDataSchema,
  OrderPlacedDataSchema,
  OrderPaidDataSchema,
  OrderVoidedDataSchema,
} from './types';

registerContracts({
  moduleName: 'orders',
  emits: [
    { eventType: 'order.opened.v1', dataSchema: OrderOpenedDataSchema },
    { eventType: 'order.line_added.v1', dataSchema: OrderLineAddedDataSchema },
    { eventType: 'order.line_removed.v1', dataSchema: OrderLineRemovedDataSchema },
    { eventType: 'order.service_charge_added.v1', dataSchema: OrderServiceChargeAddedDataSchema },
    { eventType: 'order.service_charge_removed.v1', dataSchema: OrderServiceChargeRemovedDataSchema },
    { eventType: 'order.discount_applied.v1', dataSchema: OrderDiscountAppliedDataSchema },
    { eventType: 'order.placed.v1', dataSchema: OrderPlacedDataSchema },
    { eventType: 'order.paid.v1', dataSchema: OrderPaidDataSchema },
    { eventType: 'order.voided.v1', dataSchema: OrderVoidedDataSchema },
  ],
  consumes: [],
});
