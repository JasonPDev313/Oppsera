import { registerContracts } from '@oppsera/core/events/contracts';
import {
  TenderRecordedDataSchema,
  TenderReversedDataSchema,
  OrderVoidedDataSchema,
} from './types';

registerContracts({
  moduleName: 'tenders',
  emits: [
    { eventType: 'tender.recorded.v1', dataSchema: TenderRecordedDataSchema },
    { eventType: 'tender.reversed.v1', dataSchema: TenderReversedDataSchema },
  ],
  consumes: [
    { eventType: 'order.voided.v1', dataSchema: OrderVoidedDataSchema },
  ],
});
