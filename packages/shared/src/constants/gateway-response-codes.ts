// ── Gateway Response Code Registry ─────────────────────────────
// Canonical interpretation of Fiserv/CardPointe gateway response codes.
// Used by the response interpreter service and frontend display components.
// Source: https://developer.cardpointe.com/gateway-response-codes

// ── Types ──────────────────────────────────────────────────────

export type DeclineCategory =
  | 'approved'
  | 'hard'          // Never retry (stolen card, closed account, fraud)
  | 'soft'          // Retry later (insufficient funds, issuer timeout)
  | 'data_fix'      // Fix input data and retry (bad expiry, CVV mismatch)
  | 'config_error'  // Merchant/terminal configuration issue
  | 'fraud'         // Suspected fraud — do not retry
  | 'network_error'; // Temporary network/system issue

export type SuggestedAction =
  | 'none'                 // Approved — no action needed
  | 'try_different_card'   // Hard decline — different payment method
  | 'retry_later'          // Soft decline — try again later
  | 'fix_and_retry'        // Data issue — correct and retry
  | 'contact_issuer'       // Cardholder should call their bank
  | 'try_again'            // Network/timeout — immediate retry OK
  | 'contact_support';     // Config error — contact management/support

export interface GatewayResponseCode {
  readonly code: string;
  readonly processor: string;
  readonly respstat: 'A' | 'B' | 'C';
  readonly description: string;        // Internal/operator description
  readonly userMessage: string;        // Cardholder-safe message
  readonly declineCategory: DeclineCategory;
  readonly suggestedAction: SuggestedAction;
  readonly retryable: boolean;
}

export interface AvsInterpretation {
  readonly code: string;
  readonly description: string;
  readonly addressMatch: boolean;
  readonly zipMatch: boolean;
  readonly pass: boolean;
}

export interface CvvInterpretation {
  readonly code: string;
  readonly description: string;
  readonly pass: boolean;
}

export interface VisaDeclineCategoryInfo {
  readonly label: string;
  readonly maxRetries: number;
  readonly windowDays: number | null;
  readonly description: string;
}

export interface McAdviceCodeInfo {
  readonly code: string;
  readonly description: string;
  readonly action: string;
  readonly retryable: boolean;
  readonly waitHours: number | null;
}

// ── User Messages (reusable constants) ─────────────────────────
// These are the ONLY messages shown to cardholders. They never contain
// raw response codes, system internals, or card details.

const MSG_APPROVED = 'Payment approved.';
const MSG_DECLINED = 'Payment declined. Please try a different payment method.';
const MSG_INSUFFICIENT = 'Payment declined — insufficient funds.';
const MSG_EXPIRED = 'Card expired. Please use a different card.';
const MSG_INVALID_CARD = 'Invalid card number. Please check and try again.';
const MSG_CONTACT_ISSUER = 'Payment declined. Please contact your card issuer.';
const MSG_TRY_AGAIN = 'Payment could not be processed. Please try again.';
const MSG_CONFIG = 'Payment system configuration error. Please contact management.';
const MSG_FRAUD = 'Payment declined. Please contact your card issuer.';
const MSG_CVV = 'Card verification failed. Please check the security code and try again.';
const MSG_AVS = 'Address verification failed. Please check your billing address.';
const MSG_PIN = 'Incorrect PIN. Please try again.';
const MSG_PIN_EXCEEDED = 'PIN attempts exceeded. Please contact your card issuer.';
const MSG_LIMIT = 'Transaction exceeds limit. Please try a smaller amount or contact your card issuer.';
const MSG_NOT_PERMITTED = 'This transaction type is not permitted for this card.';
const MSG_LOST_STOLEN = 'Payment declined. Please contact your card issuer.';
const MSG_DUPLICATE = 'This transaction has already been processed.';
const MSG_PROFILE_SAVED = 'Payment profile saved.';
const MSG_PROFILE_DELETED = 'Payment profile deleted.';
const MSG_SETTLED = 'Transaction settled.';
const MSG_PARTIAL = 'Partial approval. Remaining balance due.';

// ── Gateway (PPS) Response Codes ───────────────────────────────

const PPS_CODES: readonly GatewayResponseCode[] = [
  { code: '00', processor: 'PPS', respstat: 'A', description: 'Approval', userMessage: MSG_APPROVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '01', processor: 'PPS', respstat: 'A', description: 'VoiceAuth Approved', userMessage: MSG_APPROVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '08', processor: 'PPS', respstat: 'A', description: 'Profile Deleted', userMessage: MSG_PROFILE_DELETED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '09', processor: 'PPS', respstat: 'A', description: 'Profile Saved', userMessage: MSG_PROFILE_SAVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '11', processor: 'PPS', respstat: 'C', description: 'Invalid card', userMessage: MSG_INVALID_CARD, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '12', processor: 'PPS', respstat: 'C', description: 'Invalid track', userMessage: MSG_INVALID_CARD, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '13', processor: 'PPS', respstat: 'C', description: 'Bad card check digit', userMessage: MSG_INVALID_CARD, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '14', processor: 'PPS', respstat: 'C', description: 'Non-numeric CVV', userMessage: MSG_CVV, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '15', processor: 'PPS', respstat: 'C', description: 'Non-numeric expiry', userMessage: MSG_EXPIRED, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '16', processor: 'PPS', respstat: 'C', description: 'Card expired', userMessage: MSG_EXPIRED, declineCategory: 'data_fix', suggestedAction: 'try_different_card', retryable: false },
  { code: '17', processor: 'PPS', respstat: 'C', description: 'Invalid zip', userMessage: MSG_AVS, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '21', processor: 'PPS', respstat: 'C', description: 'Invalid merchant', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '22', processor: 'PPS', respstat: 'C', description: 'No auth route', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '23', processor: 'PPS', respstat: 'C', description: 'No auth queue', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '24', processor: 'PPS', respstat: 'C', description: 'Reversal not supported', userMessage: 'Reversal not supported for this transaction.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '25', processor: 'PPS', respstat: 'C', description: 'No matching auth for reversal', userMessage: 'No matching authorization found for this reversal.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '26', processor: 'PPS', respstat: 'A', description: 'Txn Settled', userMessage: MSG_SETTLED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '27', processor: 'PPS', respstat: 'C', description: 'Txn Batched', userMessage: 'Transaction already batched. Cannot modify.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '28', processor: 'PPS', respstat: 'C', description: 'Txn not settled', userMessage: 'Transaction not yet settled.', declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },
  { code: '29', processor: 'PPS', respstat: 'C', description: 'Txn not found', userMessage: 'Transaction not found.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '31', processor: 'PPS', respstat: 'C', description: 'Invalid currency', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '32', processor: 'PPS', respstat: 'C', description: 'Wrong currency for merch', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '33', processor: 'PPS', respstat: 'C', description: 'Unknown card type', userMessage: MSG_INVALID_CARD, declineCategory: 'data_fix', suggestedAction: 'try_different_card', retryable: false },
  { code: '34', processor: 'PPS', respstat: 'C', description: 'Invalid field', userMessage: 'Invalid payment data. Please check and try again.', declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '35', processor: 'PPS', respstat: 'C', description: 'No postal code', userMessage: MSG_AVS, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '36', processor: 'PPS', respstat: 'C', description: 'Wallet not allowed', userMessage: 'Digital wallet payments are not accepted.', declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '37', processor: 'PPS', respstat: 'C', description: 'CVV mismatch', userMessage: MSG_CVV, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '38', processor: 'PPS', respstat: 'C', description: 'CVV is required', userMessage: MSG_CVV, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '39', processor: 'PPS', respstat: 'C', description: 'Void not permitted after 30 days', userMessage: 'Void not permitted. Transaction is too old.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '41', processor: 'PPS', respstat: 'C', description: 'Below min amount', userMessage: 'Amount is below the minimum allowed.', declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '42', processor: 'PPS', respstat: 'C', description: 'Above max amount', userMessage: MSG_LIMIT, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '43', processor: 'PPS', respstat: 'C', description: 'Invalid amount', userMessage: 'Invalid payment amount.', declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '44', processor: 'PPS', respstat: 'C', description: 'Prepaid not supported', userMessage: 'Prepaid cards are not accepted.', declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '45', processor: 'PPS', respstat: 'C', description: 'Refunds without reference not supported', userMessage: 'Refund cannot be processed without original transaction.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '46', processor: 'PPS', respstat: 'C', description: 'Partial refunds not supported', userMessage: 'Partial refunds are not supported for this transaction.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '48', processor: 'PPS', respstat: 'C', description: 'Echeck not supported', userMessage: 'Electronic check payments are not accepted.', declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '61', processor: 'PPS', respstat: 'B', description: 'Line down', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '62', processor: 'PPS', respstat: 'B', description: 'Timed out', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '63', processor: 'PPS', respstat: 'C', description: 'Bad resp format', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '64', processor: 'PPS', respstat: 'C', description: 'Bad HTTP header', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '65', processor: 'PPS', respstat: 'C', description: 'Socket close error', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '66', processor: 'PPS', respstat: 'C', description: 'Response mismatch', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '70', processor: 'PPS', respstat: 'C', description: 'Voice authorization cannot be voided', userMessage: 'Voice-authorized transactions cannot be voided.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '71', processor: 'PPS', respstat: 'C', description: 'EMV data not authorized', userMessage: MSG_TRY_AGAIN, declineCategory: 'data_fix', suggestedAction: 'try_again', retryable: true },
  { code: '91', processor: 'PPS', respstat: 'C', description: 'No TokenSecure', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '92', processor: 'PPS', respstat: 'C', description: 'No Merchant table', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '93', processor: 'PPS', respstat: 'C', description: 'No Database', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '94', processor: 'PPS', respstat: 'C', description: 'No action', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '95', processor: 'PPS', respstat: 'C', description: 'Missing config', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '96', processor: 'PPS', respstat: 'C', description: 'Profile not found', userMessage: 'Payment profile not found.', declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '97', processor: 'PPS', respstat: 'C', description: 'Merchant disabled', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '98', processor: 'PPS', respstat: 'C', description: 'Invalid token', userMessage: 'Invalid payment token. Please re-enter card details.', declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '99', processor: 'PPS', respstat: 'C', description: 'Invalid card', userMessage: MSG_INVALID_CARD, declineCategory: 'data_fix', suggestedAction: 'try_different_card', retryable: false },
  { code: '101', processor: 'PPS', respstat: 'C', description: 'AVS Mismatch', userMessage: MSG_AVS, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '102', processor: 'PPS', respstat: 'C', description: 'Service Fee Declined', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '103', processor: 'PPS', respstat: 'C', description: 'Service Fee Txn not found', userMessage: 'Associated transaction not found.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '104', processor: 'PPS', respstat: 'C', description: 'Surcharge Not Supported', userMessage: 'Surcharge is not supported for this card type.', declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '105', processor: 'PPS', respstat: 'C', description: 'Invalid EMV', userMessage: MSG_TRY_AGAIN, declineCategory: 'data_fix', suggestedAction: 'try_again', retryable: true },
  { code: '106', processor: 'PPS', respstat: 'B', description: 'Txn type not supported - Please insert the card', userMessage: 'Please insert the card instead of tapping.', declineCategory: 'data_fix', suggestedAction: 'try_again', retryable: true },
];

// ── Rapid Connect (RPCT) Response Codes ────────────────────────
// Most comprehensive processor — covers First Data Rapid Connect.

const RPCT_CODES: readonly GatewayResponseCode[] = [
  // Approvals
  { code: '000', processor: 'RPCT', respstat: 'A', description: 'Approve', userMessage: MSG_APPROVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '002', processor: 'RPCT', respstat: 'A', description: 'Approve for partial amount', userMessage: MSG_PARTIAL, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '003', processor: 'RPCT', respstat: 'A', description: 'Approve VIP', userMessage: MSG_APPROVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '701', processor: 'RPCT', respstat: 'A', description: 'Approved EMV Key Load', userMessage: MSG_APPROVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '708', processor: 'RPCT', respstat: 'A', description: 'Honor With Authentication', userMessage: MSG_APPROVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },
  { code: '785', processor: 'RPCT', respstat: 'A', description: 'No reason to decline', userMessage: MSG_APPROVED, declineCategory: 'approved', suggestedAction: 'none', retryable: false },

  // Hard declines — do not honor / generic
  { code: '001', processor: 'RPCT', respstat: 'C', description: 'Schema Validation Error', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '100', processor: 'RPCT', respstat: 'C', description: 'Do not honor', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '500', processor: 'RPCT', respstat: 'C', description: 'Decline', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '504', processor: 'RPCT', respstat: 'C', description: 'Do not try again', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },

  // Card issues
  { code: '101', processor: 'RPCT', respstat: 'C', description: 'Expired card', userMessage: MSG_EXPIRED, declineCategory: 'data_fix', suggestedAction: 'try_different_card', retryable: false },
  { code: '104', processor: 'RPCT', respstat: 'C', description: 'Restricted card', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '109', processor: 'RPCT', respstat: 'C', description: 'Invalid merchant', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '110', processor: 'RPCT', respstat: 'C', description: 'Invalid amount', userMessage: 'Invalid payment amount.', declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '114', processor: 'RPCT', respstat: 'C', description: 'Invalid account type', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '116', processor: 'RPCT', respstat: 'C', description: 'Not sufficient funds', userMessage: MSG_INSUFFICIENT, declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },
  { code: '117', processor: 'RPCT', respstat: 'C', description: 'Incorrect PIN', userMessage: MSG_PIN, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '118', processor: 'RPCT', respstat: 'C', description: 'No card record', userMessage: MSG_INVALID_CARD, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '119', processor: 'RPCT', respstat: 'C', description: 'Transaction not permitted to cardholder', userMessage: MSG_NOT_PERMITTED, declineCategory: 'hard', suggestedAction: 'contact_issuer', retryable: false },
  { code: '120', processor: 'RPCT', respstat: 'C', description: 'Transaction not permitted to terminal', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '121', processor: 'RPCT', respstat: 'C', description: 'Exceeds withdrawal amount', userMessage: MSG_LIMIT, declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },
  { code: '122', processor: 'RPCT', respstat: 'C', description: 'Security violation', userMessage: MSG_FRAUD, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },
  { code: '123', processor: 'RPCT', respstat: 'C', description: 'Exceeds withdrawal frequency limit', userMessage: MSG_LIMIT, declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },
  { code: '124', processor: 'RPCT', respstat: 'C', description: 'Violation of law', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '129', processor: 'RPCT', respstat: 'C', description: 'Suspected counterfeit card', userMessage: MSG_FRAUD, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },
  { code: '130', processor: 'RPCT', respstat: 'C', description: 'Invalid terminal', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '131', processor: 'RPCT', respstat: 'C', description: 'Invalid account number', userMessage: MSG_INVALID_CARD, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '132', processor: 'RPCT', respstat: 'C', description: 'Unmatched card expiry date', userMessage: MSG_EXPIRED, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },

  // Fraud / pickup
  { code: '102', processor: 'RPCT', respstat: 'C', description: 'Suspected fraud', userMessage: MSG_FRAUD, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },
  { code: '105', processor: 'RPCT', respstat: 'C', description: 'Call acquirer security department', userMessage: MSG_CONTACT_ISSUER, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },
  { code: '208', processor: 'RPCT', respstat: 'C', description: 'Lost card', userMessage: MSG_LOST_STOLEN, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },
  { code: '209', processor: 'RPCT', respstat: 'C', description: 'Stolen card', userMessage: MSG_LOST_STOLEN, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },
  { code: '704', processor: 'RPCT', respstat: 'C', description: 'Pick Up Card', userMessage: MSG_LOST_STOLEN, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },
  { code: '767', processor: 'RPCT', respstat: 'C', description: 'Hard Capture; Pick Up', userMessage: MSG_LOST_STOLEN, declineCategory: 'fraud', suggestedAction: 'contact_issuer', retryable: false },

  // PIN issues
  { code: '106', processor: 'RPCT', respstat: 'C', description: 'Allowable PIN tries exceeded', userMessage: MSG_PIN_EXCEEDED, declineCategory: 'hard', suggestedAction: 'contact_issuer', retryable: false },

  // Referral / call issuer
  { code: '107', processor: 'RPCT', respstat: 'C', description: 'Call for authorization', userMessage: MSG_CONTACT_ISSUER, declineCategory: 'soft', suggestedAction: 'contact_issuer', retryable: false },
  { code: '108', processor: 'RPCT', respstat: 'C', description: 'Refer to issuer special conditions', userMessage: MSG_CONTACT_ISSUER, declineCategory: 'soft', suggestedAction: 'contact_issuer', retryable: false },

  // Account issues
  { code: '302', processor: 'RPCT', respstat: 'C', description: 'Account closed', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '303', processor: 'RPCT', respstat: 'C', description: 'Unknown account', userMessage: MSG_INVALID_CARD, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '304', processor: 'RPCT', respstat: 'C', description: 'Inactive account', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '332', processor: 'RPCT', respstat: 'C', description: 'Account locked', userMessage: MSG_CONTACT_ISSUER, declineCategory: 'hard', suggestedAction: 'contact_issuer', retryable: false },

  // CVV / security
  { code: '517', processor: 'RPCT', respstat: 'C', description: 'CVV2 Declined', userMessage: MSG_CVV, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '954', processor: 'RPCT', respstat: 'C', description: 'CCV failed', userMessage: MSG_CVV, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '958', processor: 'RPCT', respstat: 'C', description: 'CCV2 failed', userMessage: MSG_CVV, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },

  // AVS
  { code: '721', processor: 'RPCT', respstat: 'C', description: 'Invalid ZIP Code', userMessage: MSG_AVS, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },

  // Retry / soft declines
  { code: '505', processor: 'RPCT', respstat: 'B', description: 'Please retry', userMessage: MSG_TRY_AGAIN, declineCategory: 'soft', suggestedAction: 'try_again', retryable: true },
  { code: '508', processor: 'RPCT', respstat: 'B', description: 'Try again later - Declined', userMessage: MSG_TRY_AGAIN, declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },
  { code: '511', processor: 'RPCT', respstat: 'B', description: 'Card expired. Get new expiration and try again', userMessage: MSG_EXPIRED, declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '516', processor: 'RPCT', respstat: 'B', description: 'Please retry', userMessage: MSG_TRY_AGAIN, declineCategory: 'soft', suggestedAction: 'try_again', retryable: true },
  { code: '911', processor: 'RPCT', respstat: 'B', description: 'Card issuer timed out', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '920', processor: 'RPCT', respstat: 'B', description: 'Security H/W or S/W error - try again', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },

  // System errors
  { code: '906', processor: 'RPCT', respstat: 'C', description: 'System Error', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '907', processor: 'RPCT', respstat: 'C', description: 'Card issuer or switch inoperative', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '908', processor: 'RPCT', respstat: 'C', description: 'Transaction destination not found', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '909', processor: 'RPCT', respstat: 'C', description: 'System malfunction', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '963', processor: 'RPCT', respstat: 'C', description: 'Acquirer channel unavailable', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },

  // Duplicate / reversal issues
  { code: '334', processor: 'RPCT', respstat: 'C', description: 'Already reversed', userMessage: 'Transaction has already been reversed.', declineCategory: 'hard', suggestedAction: 'none', retryable: false },
  { code: '913', processor: 'RPCT', respstat: 'C', description: 'Duplicate transaction', userMessage: MSG_DUPLICATE, declineCategory: 'hard', suggestedAction: 'none', retryable: false },
  { code: '914', processor: 'RPCT', respstat: 'C', description: 'Original Authorization was not found', userMessage: 'Original authorization not found.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '520', processor: 'RPCT', respstat: 'C', description: 'Reversal Rejected', userMessage: 'Reversal was rejected by the processor.', declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },

  // Transaction not permitted
  { code: '512', processor: 'RPCT', respstat: 'C', description: 'Service not allowed', userMessage: MSG_NOT_PERMITTED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '513', processor: 'RPCT', respstat: 'C', description: 'Transaction not permitted to acquirer or terminal', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },

  // Recurring billing
  { code: '509', processor: 'RPCT', respstat: 'C', description: 'Do not try again - Card expired', userMessage: MSG_EXPIRED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '790', processor: 'RPCT', respstat: 'C', description: 'Do not resubmit same transaction but continue billing', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '791', processor: 'RPCT', respstat: 'C', description: 'Stop recurring payment requests', userMessage: 'Recurring payment has been canceled by the cardholder.', declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },

  // 3DS
  { code: '531', processor: 'RPCT', respstat: 'C', description: 'Retry with 3DS', userMessage: 'Additional authentication required. Please try again.', declineCategory: 'data_fix', suggestedAction: 'try_again', retryable: true },

  // Amount issues
  { code: '521', processor: 'RPCT', respstat: 'C', description: 'Enter lesser amount', userMessage: MSG_LIMIT, declineCategory: 'soft', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '771', processor: 'RPCT', respstat: 'C', description: 'Amount Too Large', userMessage: MSG_LIMIT, declineCategory: 'soft', suggestedAction: 'fix_and_retry', retryable: true },

  // EMV
  { code: '702', processor: 'RPCT', respstat: 'C', description: 'EMV Key Download Error', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },

  // Velocity
  { code: '805', processor: 'RPCT', respstat: 'C', description: 'Velocity exceeded', userMessage: MSG_LIMIT, declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },

  // Stored value / gift card specific
  { code: '150', processor: 'RPCT', respstat: 'C', description: 'Invalid merchant set up', userMessage: MSG_CONFIG, declineCategory: 'config_error', suggestedAction: 'contact_support', retryable: false },
  { code: '151', processor: 'RPCT', respstat: 'C', description: 'Activation failed', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '152', processor: 'RPCT', respstat: 'C', description: 'Exceeds limit', userMessage: MSG_LIMIT, declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },
  { code: '153', processor: 'RPCT', respstat: 'C', description: 'Already redeemed', userMessage: 'This card has already been redeemed.', declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },
  { code: '155', processor: 'RPCT', respstat: 'C', description: 'Recharge amount exceeded', userMessage: MSG_LIMIT, declineCategory: 'hard', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '317', processor: 'RPCT', respstat: 'C', description: 'Max balance exceeded', userMessage: MSG_LIMIT, declineCategory: 'hard', suggestedAction: 'try_different_card', retryable: false },

  // TransArmor
  { code: '402', processor: 'RPCT', respstat: 'C', description: 'TransArmor Service Unavailable', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '403', processor: 'RPCT', respstat: 'C', description: 'TransArmor Invalid Token or Account Number', userMessage: 'Invalid payment token. Please re-enter card details.', declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },

  // Debit-specific
  { code: '524', processor: 'RPCT', respstat: 'C', description: 'Debit Switch unavailable', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '525', processor: 'RPCT', respstat: 'C', description: 'Debit/EBT network cannot reach issuer', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },
  { code: '528', processor: 'RPCT', respstat: 'C', description: 'Debit/EBT transaction count exceeded', userMessage: MSG_LIMIT, declineCategory: 'soft', suggestedAction: 'retry_later', retryable: true },

  // Invalid data
  { code: '722', processor: 'RPCT', respstat: 'C', description: 'Invalid value in the field', userMessage: 'Invalid payment data. Please check and try again.', declineCategory: 'data_fix', suggestedAction: 'fix_and_retry', retryable: true },
  { code: '902', processor: 'RPCT', respstat: 'C', description: 'Invalid transaction', userMessage: MSG_DECLINED, declineCategory: 'hard', suggestedAction: 'contact_support', retryable: false },
  { code: '904', processor: 'RPCT', respstat: 'C', description: 'Format error', userMessage: MSG_TRY_AGAIN, declineCategory: 'network_error', suggestedAction: 'try_again', retryable: true },

  // Misc
  { code: '315', processor: 'RPCT', respstat: 'C', description: 'Bad mag stripe', userMessage: 'Card could not be read. Please try again or use a different card.', declineCategory: 'data_fix', suggestedAction: 'try_again', retryable: true },
  { code: '772', processor: 'RPCT', respstat: 'C', description: 'Duplicate Return', userMessage: 'This refund has already been processed.', declineCategory: 'hard', suggestedAction: 'none', retryable: false },
  { code: '774', processor: 'RPCT', respstat: 'C', description: 'Duplicate Reversal', userMessage: 'This reversal has already been processed.', declineCategory: 'hard', suggestedAction: 'none', retryable: false },
  { code: '776', processor: 'RPCT', respstat: 'C', description: 'Duplicate Completion', userMessage: 'This capture has already been processed.', declineCategory: 'hard', suggestedAction: 'none', retryable: false },
  { code: '942', processor: 'RPCT', respstat: 'C', description: 'Customer cancellation', userMessage: 'Transaction was cancelled.', declineCategory: 'hard', suggestedAction: 'none', retryable: false },
];

// ── Combined Registry ──────────────────────────────────────────

export const GATEWAY_RESPONSE_CODES: readonly GatewayResponseCode[] = [
  ...PPS_CODES,
  ...RPCT_CODES,
];

// ── AVS Response Codes ─────────────────────────────────────────
// Source: First Data platforms (Rapid Connect, North, Omaha)

export const AVS_RESPONSE_CODES: readonly AvsInterpretation[] = [
  // Full match
  { code: 'Y', description: 'Address and 5-digit ZIP match', addressMatch: true, zipMatch: true, pass: true },
  { code: 'X', description: 'Address and 9-digit ZIP match', addressMatch: true, zipMatch: true, pass: true },
  { code: 'F', description: 'UK address and postal code match', addressMatch: true, zipMatch: true, pass: true },
  { code: 'D', description: 'Non-US address and postal code match', addressMatch: true, zipMatch: true, pass: true },
  // Partial match
  { code: 'A', description: 'Address matches, ZIP does not', addressMatch: true, zipMatch: false, pass: false },
  { code: 'Z', description: 'ZIP matches, address does not', addressMatch: false, zipMatch: true, pass: false },
  { code: 'W', description: '9-digit ZIP matches, address does not', addressMatch: false, zipMatch: true, pass: false },
  { code: 'P', description: 'Non-US postal code matches, address not verified', addressMatch: false, zipMatch: true, pass: false },
  // No match
  { code: 'N', description: 'Neither address nor ZIP match', addressMatch: false, zipMatch: false, pass: false },
  // Not attempted / unavailable
  { code: 'R', description: 'AVS system unavailable — retry', addressMatch: false, zipMatch: false, pass: false },
  { code: 'S', description: 'AVS not supported by issuer', addressMatch: false, zipMatch: false, pass: false },
  { code: 'U', description: 'Address information unavailable', addressMatch: false, zipMatch: false, pass: false },
  { code: 'G', description: 'Non-US issuer, AVS not available', addressMatch: false, zipMatch: false, pass: false },
  { code: '', description: 'AVS not attempted', addressMatch: false, zipMatch: false, pass: false },
];

// ── CVV Response Codes ─────────────────────────────────────────

export const CVV_RESPONSE_CODES: readonly CvvInterpretation[] = [
  { code: 'M', description: 'CVV matches', pass: true },
  { code: 'N', description: 'CVV does not match', pass: false },
  { code: 'P', description: 'Authorization was not processed', pass: false },
  { code: 'S', description: 'CVV not present on card', pass: false },
  { code: 'U', description: 'CVV verification not supported by issuer', pass: false },
  { code: 'X', description: 'Provider did not respond (timeout)', pass: false },
];

// ── Visa Decline Categories ────────────────────────────────────
// Visa charges fees for excessive reattempts on category 1 declines.

export const VISA_DECLINE_CATEGORIES: Record<number, VisaDeclineCategoryInfo> = {
  1: { label: 'Issuer Will Never Approve', maxRetries: 0, windowDays: null, description: 'Do not retry. Account is permanently blocked, closed, or fraudulent.' },
  2: { label: 'Issuer Cannot Approve Now', maxRetries: 15, windowDays: 30, description: 'May retry up to 15 times within 30 days. Insufficient funds, velocity limits, or system errors.' },
  3: { label: 'Data Quality Issue', maxRetries: 15, windowDays: 30, description: 'Fix cardholder data (expiry, card number, CVV) then retry. Max 15 attempts in 30 days.' },
};

// ── Mastercard Merchant Advice Codes ───────────────────────────

export const MC_ADVICE_CODES: readonly McAdviceCodeInfo[] = [
  { code: '01', description: 'New account information available', action: 'Update account info from issuer and retry', retryable: true, waitHours: null },
  { code: '02', description: 'Cannot approve at this time', action: 'Retry after 72 hours', retryable: true, waitHours: 72 },
  { code: '03', description: 'Account closed', action: 'Do not retry — account permanently closed', retryable: false, waitHours: null },
  { code: '04', description: 'Token requirements not fulfilled', action: 'Update token credentials and retry', retryable: true, waitHours: null },
  { code: '05', description: 'Card account closed or fraud', action: 'Do not retry — remove payment method', retryable: false, waitHours: null },
  { code: '06', description: 'Cardholder canceled recurring payment', action: 'Stop recurring — cardholder opted out', retryable: false, waitHours: null },
  { code: '07', description: 'Cancel specific payment', action: 'Cancel this specific recurring charge', retryable: false, waitHours: null },
  { code: '21', description: 'Stop recurring for this merchant', action: 'Stop all recurring charges for this merchant', retryable: false, waitHours: null },
  { code: '22', description: 'Merchant does not qualify for product code', action: 'Contact processor — merchant config issue', retryable: false, waitHours: null },
  { code: '24', description: 'Retry after 1 hour', action: 'Wait 1 hour then retry', retryable: true, waitHours: 1 },
  { code: '25', description: 'Retry after 24 hours', action: 'Wait 24 hours then retry', retryable: true, waitHours: 24 },
  { code: '26', description: 'Retry after 2 days', action: 'Wait 48 hours then retry', retryable: true, waitHours: 48 },
  { code: '27', description: 'Retry after 4 days', action: 'Wait 96 hours then retry', retryable: true, waitHours: 96 },
  { code: '28', description: 'Retry after 6 days', action: 'Wait 144 hours then retry', retryable: true, waitHours: 144 },
  { code: '29', description: 'Retry after 8 days', action: 'Wait 192 hours then retry', retryable: true, waitHours: 192 },
  { code: '30', description: 'Retry after 10 days', action: 'Wait 240 hours then retry', retryable: true, waitHours: 240 },
  { code: '40', description: 'Non-reloadable prepaid card', action: 'Do not retry — card cannot be reloaded', retryable: false, waitHours: null },
  { code: '41', description: 'Single-use virtual card', action: 'Do not retry — card is single-use', retryable: false, waitHours: null },
  { code: '43', description: 'Consumer multi-use virtual card number', action: 'May be returned on approved transactions', retryable: true, waitHours: null },
];

// ── Lookup Helpers ─────────────────────────────────────────────

let _responseCodeMap: Map<string, GatewayResponseCode> | null = null;

/** Lookup by `PROCESSOR:CODE` key (e.g., `PPS:11`, `RPCT:116`). Lazy-built, cached. */
export function getResponseCodeMap(): Map<string, GatewayResponseCode> {
  if (!_responseCodeMap) {
    _responseCodeMap = new Map();
    for (const rc of GATEWAY_RESPONSE_CODES) {
      _responseCodeMap.set(`${rc.processor}:${rc.code}`, rc);
    }
  }
  return _responseCodeMap;
}

let _avsMap: Map<string, AvsInterpretation> | null = null;

export function getAvsMap(): Map<string, AvsInterpretation> {
  if (!_avsMap) {
    _avsMap = new Map();
    for (const avs of AVS_RESPONSE_CODES) {
      _avsMap.set(avs.code, avs);
    }
  }
  return _avsMap;
}

let _cvvMap: Map<string, CvvInterpretation> | null = null;

export function getCvvMap(): Map<string, CvvInterpretation> {
  if (!_cvvMap) {
    _cvvMap = new Map();
    for (const cvv of CVV_RESPONSE_CODES) {
      _cvvMap.set(cvv.code, cvv);
    }
  }
  return _cvvMap;
}

// ── Display Labels ─────────────────────────────────────────────

export const DECLINE_CATEGORY_LABELS: Record<DeclineCategory, string> = {
  approved: 'Approved',
  hard: 'Hard Decline',
  soft: 'Soft Decline',
  data_fix: 'Data Issue',
  config_error: 'Configuration Error',
  fraud: 'Fraud / Security',
  network_error: 'Network Error',
};

export const SUGGESTED_ACTION_LABELS: Record<SuggestedAction, string> = {
  none: '',
  try_different_card: 'Try a different card',
  retry_later: 'Try again later',
  fix_and_retry: 'Fix data and retry',
  contact_issuer: 'Contact card issuer',
  try_again: 'Try again',
  contact_support: 'Contact support',
};
