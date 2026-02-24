/**
 * CardPointe Terminal API types.
 *
 * The Terminal API is SEPARATE from the Gateway REST API:
 * - Base URL: https://{site}.cardconnect.com/api/v3/
 * - Auth: session-based (connect → sessionKey → x-cardconnect-sessionkey header)
 * - Used for card-present / in-person transactions via physical hardware
 */

// ── Connect / Disconnect ─────────────────────────────────────

export interface TerminalConnectRequest {
  hsn: string;
  merchantId: string;
  force?: boolean; // force-connect even if another session exists
}

export interface TerminalConnectResponse {
  sessionKey: string;
  expiresAt?: string;
}

export interface TerminalDisconnectRequest {
  hsn: string;
  sessionKey: string;
}

// ── Auth Card (card-present authorization) ───────────────────

export interface TerminalAuthCardRequest {
  hsn: string;
  amount: string; // dollar string "10.00"
  includeSignature?: boolean;
  includeReceipt?: boolean;
  beep?: boolean;
  aid?: 'credit' | 'debit' | 'default';
  goBankruptcy?: boolean;
  orderId?: string;
  capture?: 'Y' | 'N'; // Y = sale (auth + capture), N = auth only
  surcharge?: string; // dollar string for surcharge amount
  tipAmount?: string; // dollar string for tip
  userref?: string;
}

export interface TerminalAuthCardResponse {
  token: string;
  retref: string;
  authCode: string;
  respCode: string;
  respText: string;
  respStat: 'A' | 'B' | 'C'; // A=approved, B=retry, C=declined
  amount: string;
  cardBrand: string; // VISA, MC, AMEX, DISC
  cardLast4: string;
  binType?: string; // 'credit' | 'debit' | 'prepaid'
  entryMode?: string; // 'Chip Read' | 'Contactless' | 'Swiped' | 'Manual'
  emvData?: EmvData;
  receipt?: Record<string, unknown>;
  signature?: string; // base64
}

// ── Read Card (read only, no auth) ──────────────────────────

export interface TerminalReadCardRequest {
  hsn: string;
  amount?: string;
  includeSignature?: boolean;
  beep?: boolean;
  aid?: 'credit' | 'debit' | 'default';
}

export interface TerminalReadCardResponse {
  token: string;
  cardLast4: string;
  cardBrand: string;
  binType?: string;
  expiry?: string; // MMYY
  entryMode?: string;
  emvData?: EmvData;
}

// ── Read Manual (manual card entry on device) ────────────────

export interface TerminalReadManualRequest {
  hsn: string;
  includeExpiry?: boolean;
  includeCvv?: boolean;
  beep?: boolean;
}

export interface TerminalReadManualResponse {
  token: string;
  expiry?: string;
  cardLast4: string;
  cardBrand: string;
  binType?: string;
}

// ── Display / Clear ──────────────────────────────────────────

export interface TerminalDisplayRequest {
  hsn: string;
  text: string;
}

export interface TerminalClearDisplayRequest {
  hsn: string;
}

// ── Cancel ───────────────────────────────────────────────────

export interface TerminalCancelRequest {
  hsn: string;
}

// ── Tip Prompt ───────────────────────────────────────────────

export interface TerminalTipRequest {
  hsn: string;
  amount: string; // base amount for tip calculation
  tipOptions?: string[]; // e.g. ["15", "18", "20"] percent options
}

export interface TerminalTipResponse {
  tipAmount: string; // selected tip in dollars
}

// ── PAN Pad (custom amount entry) ────────────────────────────

export interface TerminalPanPadRequest {
  hsn: string;
  prompt?: string;
}

export interface TerminalPanPadResponse {
  amount: string;
}

// ── Ping ─────────────────────────────────────────────────────

export interface TerminalPingResponse {
  connected: boolean;
  hsn: string;
  firmwareVersion?: string;
}

// ── Date/Time ────────────────────────────────────────────────

export interface TerminalDateTimeResponse {
  dateTime: string;
}

// ── List Terminals ───────────────────────────────────────────

export interface TerminalListItem {
  hsn: string;
  terminalId?: string;
  status: string;
}

// ── Shared Types ─────────────────────────────────────────────

export interface EmvData {
  applicationLabel?: string;
  aid?: string;
  tvr?: string;
  tsi?: string;
  cryptogram?: string;
  cryptogramType?: string;
  [key: string]: unknown;
}

export type TerminalStatus = 'connected' | 'disconnected' | 'error' | 'busy';

export type EntryMode = 'chip' | 'tap' | 'swipe' | 'manual';

/** Map CardPointe entryMode strings to our canonical enum */
export function normalizeEntryMode(raw?: string): EntryMode {
  if (!raw) return 'manual';
  const lower = raw.toLowerCase();
  if (lower.includes('chip')) return 'chip';
  if (lower.includes('contactless') || lower.includes('tap')) return 'tap';
  if (lower.includes('swipe')) return 'swipe';
  return 'manual';
}
