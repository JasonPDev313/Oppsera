/**
 * NACHA ACH Return Code Registry.
 * Codes R01-R85 with classification, retry eligibility, and descriptions.
 */

export interface AchReturnCode {
  code: string;
  description: string;
  category: AchReturnCategory;
  retryable: boolean;
  retryDelayDays: number; // 0 = not retryable
  isAdministrative: boolean; // administrative returns (R61-R69) handled differently
}

export type AchReturnCategory =
  | 'nsf'           // insufficient funds
  | 'closed'        // account closed
  | 'invalid'       // invalid account / routing
  | 'unauthorized'  // customer disputes authorization
  | 'admin'         // administrative / bank-initiated
  | 'regulatory'    // regulatory / compliance
  | 'other';        // miscellaneous

const ACH_RETURN_CODES: Record<string, AchReturnCode> = {
  R01: { code: 'R01', description: 'Insufficient Funds', category: 'nsf', retryable: true, retryDelayDays: 2, isAdministrative: false },
  R02: { code: 'R02', description: 'Account Closed', category: 'closed', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R03: { code: 'R03', description: 'No Account / Unable to Locate Account', category: 'invalid', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R04: { code: 'R04', description: 'Invalid Account Number', category: 'invalid', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R05: { code: 'R05', description: 'Unauthorized Debit to Consumer Account', category: 'unauthorized', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R06: { code: 'R06', description: 'Returned per ODFI Request', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R07: { code: 'R07', description: 'Authorization Revoked by Customer', category: 'unauthorized', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R08: { code: 'R08', description: 'Payment Stopped', category: 'unauthorized', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R09: { code: 'R09', description: 'Uncollected Funds', category: 'nsf', retryable: true, retryDelayDays: 2, isAdministrative: false },
  R10: { code: 'R10', description: 'Customer Advises Originator is Not Known and/or Not Authorized', category: 'unauthorized', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R11: { code: 'R11', description: 'Check Truncation Entry Return', category: 'other', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R12: { code: 'R12', description: 'Branch Sold to Another DFI', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R13: { code: 'R13', description: 'RDFI Not Qualified to Participate', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R14: { code: 'R14', description: 'Representative Payee Deceased or Unable to Continue', category: 'closed', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R15: { code: 'R15', description: 'Beneficiary or Account Holder Deceased', category: 'closed', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R16: { code: 'R16', description: 'Account Frozen / Entry Returned per OFAC Instruction', category: 'regulatory', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R17: { code: 'R17', description: 'File Record Edit Criteria', category: 'invalid', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R20: { code: 'R20', description: 'Non-Transaction Account', category: 'invalid', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R21: { code: 'R21', description: 'Invalid Company Identification', category: 'invalid', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R22: { code: 'R22', description: 'Invalid Individual ID Number', category: 'invalid', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R23: { code: 'R23', description: 'Credit Entry Refused by Receiver', category: 'unauthorized', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R24: { code: 'R24', description: 'Duplicate Entry', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R29: { code: 'R29', description: 'Corporate Customer Advises Not Authorized', category: 'unauthorized', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R31: { code: 'R31', description: 'Permissible Return Entry (CCD and CTX only)', category: 'other', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R33: { code: 'R33', description: 'Return of XCK Entry', category: 'other', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R51: { code: 'R51', description: 'Item Related to RCK Entry is Ineligible', category: 'other', retryable: false, retryDelayDays: 0, isAdministrative: false },
  // Administrative returns
  R61: { code: 'R61', description: 'Misrouted Return', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R67: { code: 'R67', description: 'Duplicate Return', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R68: { code: 'R68', description: 'Untimely Return', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R69: { code: 'R69', description: 'Field Error(s)', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R70: { code: 'R70', description: 'Permissible Return Entry Not Accepted', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
  R80: { code: 'R80', description: 'IAT Entry Coding Error', category: 'invalid', retryable: false, retryDelayDays: 0, isAdministrative: false },
  R83: { code: 'R83', description: 'Foreign Receiving DFI Unable to Settle', category: 'admin', retryable: false, retryDelayDays: 0, isAdministrative: true },
};

/**
 * Look up an ACH return code. Returns undefined for unknown codes.
 */
export function getReturnCode(code: string): AchReturnCode | undefined {
  return ACH_RETURN_CODES[code.toUpperCase()];
}

/**
 * Check if a return code is retryable (R01 NSF, R09 Uncollected).
 * NACHA allows up to 2 re-presentations for R01/R09.
 */
export function isRetryableReturn(code: string): boolean {
  const entry = ACH_RETURN_CODES[code.toUpperCase()];
  return entry?.retryable ?? false;
}

/**
 * Get retry delay in business days for a return code.
 * Returns 0 for non-retryable codes.
 */
export function getRetryDelayDays(code: string): number {
  const entry = ACH_RETURN_CODES[code.toUpperCase()];
  return entry?.retryDelayDays ?? 0;
}

/**
 * Classify a return code into a high-level category for reporting.
 */
export function classifyReturn(code: string): AchReturnCategory {
  const entry = ACH_RETURN_CODES[code.toUpperCase()];
  return entry?.category ?? 'other';
}

/**
 * Get human-readable description for a return code.
 */
export function getReturnDescription(code: string): string {
  const entry = ACH_RETURN_CODES[code.toUpperCase()];
  return entry?.description ?? `Unknown return code: ${code}`;
}

/**
 * Check if a return is administrative (R61-R69 range, plus R70, R83).
 */
export function isAdministrativeReturn(code: string): boolean {
  const entry = ACH_RETURN_CODES[code.toUpperCase()];
  return entry?.isAdministrative ?? false;
}

/**
 * All known return codes — useful for reporting dropdown filters.
 */
export const ALL_RETURN_CODES = Object.values(ACH_RETURN_CODES);
