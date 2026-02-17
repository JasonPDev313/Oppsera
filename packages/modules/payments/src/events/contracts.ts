import { registerContracts } from '@oppsera/core/events/contracts';
import {
  TenderRecordedDataSchema,
  TenderReversedDataSchema,
  TenderTipAdjustedDataSchema,
  OrderVoidedDataSchema,
} from './types';

registerContracts({
  moduleName: 'tenders',
  emits: [
    { eventType: 'tender.recorded.v1', dataSchema: TenderRecordedDataSchema },
    { eventType: 'tender.reversed.v1', dataSchema: TenderReversedDataSchema },
    { eventType: 'tender.tip_adjusted.v1', dataSchema: TenderTipAdjustedDataSchema },
  ],
  consumes: [
    { eventType: 'order.voided.v1', dataSchema: OrderVoidedDataSchema },
  ],
});
