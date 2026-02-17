export const MODULE_KEY = 'payments' as const;
export const MODULE_NAME = 'Payments & Tenders';
export const MODULE_VERSION = '1.0.0';

// Register event contracts (side-effect import)
import './events/contracts';

// Commands
export { recordTender, reverseTender, adjustTip } from './commands';

// Queries
export { getTendersByOrder, listTenders, getPaymentJournalEntries } from './queries';
export type { TenderSummary, TenderWithReversals } from './queries/get-tenders-by-order';
export type { ListTendersInput, ListTendersResult } from './queries/list-tenders';
export type { GetJournalInput, GetJournalResult } from './queries/get-payment-journal-entries';

// Validation schemas + types
export { recordTenderSchema, reverseTenderSchema, adjustTipSchema } from './validation';
export type { RecordTenderInput, ReverseTenderInput, AdjustTipInput } from './validation';

// Helpers
export { generateJournalEntry } from './helpers';
export type {
  TenderForGL,
  OrderForGL,
  OrderLineForGL,
  JournalLine,
} from './helpers';

// Event consumer
export { handleOrderVoided } from './events/consumers';
