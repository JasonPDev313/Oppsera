// ── CardPointe-specific request/response types ──────────────────
// Maps to their exact REST API format. All fields are strings (CardPointe convention).

export interface CardPointeAuthRequest {
  merchid: string;
  account: string; // token or card number
  amount: string; // dollar amount "100.00"
  expiry?: string; // MMYY
  cvv2?: string;
  currency?: string; // "USD"
  orderid?: string; // max 19 chars
  capture?: string; // "Y" or "N"
  ecomind?: string; // "E", "R", or "T"
  name?: string;
  address?: string;
  postal?: string;
  receipt?: string; // "Y" for receipt data
  userfields?: Record<string, string>;
  profile?: string; // "Y" to create profile during auth
  // ── ACH-specific fields ──
  accttype?: string; // 'ECHK' | 'ESAV' for ACH
  achEntryCode?: string; // SEC code: 'CCD' | 'PPD' | 'TEL' | 'WEB'
  achDescription?: string; // ACH description (e.g., "Reversal")
  bankaba?: string; // ABA routing number for account validation
}

export interface CardPointeAuthResponse {
  retref: string; // retrieval reference number
  authcode: string;
  amount: string;
  respstat: string; // "A" (approved), "B" (retry), "C" (declined)
  respcode: string; // 2-char response code
  resptext: string; // human-readable response
  respproc: string; // processor
  token: string; // tokenized card
  cvvresp: string;
  avsresp: string;
  commcard: string;
  receipt?: Record<string, unknown>; // receipt data
  profileid?: string;
  acctid?: string;
}

export interface CardPointeCaptureRequest {
  merchid: string;
  retref: string;
  amount?: string; // optional partial capture
}

export interface CardPointeCaptureResponse {
  retref: string;
  amount: string;
  respstat: string;
  respcode: string;
  resptext: string;
  setlstat: string; // settlement status
}

export interface CardPointeVoidRequest {
  merchid: string;
  retref: string;
}

export interface CardPointeVoidResponse {
  retref: string;
  authcode: string;
  respstat: string;
  respcode: string;
  resptext: string;
}

export interface CardPointeRefundRequest {
  merchid: string;
  retref: string;
  amount?: string; // optional partial
}

export interface CardPointeRefundResponse {
  retref: string;
  amount: string;
  respstat: string;
  respcode: string;
  resptext: string;
}

export interface CardPointeInquireResponse {
  retref: string;
  amount: string;
  respstat: string;
  respcode: string;
  resptext: string;
  authcode: string;
  setlstat: string; // "Queued", "Accepted", etc.
  token: string;
}

export interface CardPointeVoidByOrderIdRequest {
  merchid: string;
  orderid: string;
}

export interface CardPointeVoidByOrderIdResponse {
  retref: string;
  authcode: string;
  respstat: string;
  respcode: string;
  resptext: string;
}

export interface CardPointeProfileRequest {
  merchid: string;
  account: string; // token
  expiry?: string;
  name?: string;
  address?: string;
  postal?: string;
  profileupdate?: string; // "Y" when adding to existing profile
  profile?: string; // existing profile ID
}

export interface CardPointeProfileResponse {
  profileid: string;
  acctid: string;
  token: string;
  respstat: string;
  respcode: string;
  resptext: string;
}

export interface CardPointeProfileGetResponse {
  profileid: string;
  acctid: string;
  token: string;
  expiry: string;
  name: string;
  accttype: string; // "VISA", "MC", etc.
}

export interface CardPointeSettlementResponse {
  merchid: string;
  batchid: string;
  hoststat: string;
  hostbatch: string;
  txns: CardPointeSettlementTxn[];
}

export interface CardPointeSettlementTxn {
  retref: string;
  amount: string;
  setlstat: string; // "A" (accepted), "R" (rejected), etc.
  salession: string;
  batchid: string;
}

export interface CardPointeSigCapRequest {
  merchid: string;
  retref: string;
  signature: string; // base64 encoded SVG or image
}

// ── ACH Funding Response ────────────────────────────────────────
// CardPointe's funding endpoint returns ACH-specific settlement and return data.

export interface CardPointeFundingResponse {
  merchid: string;
  fundingdate: string; // MMDD
  fundings: CardPointeFundingEntry[];
}

export interface CardPointeFundingEntry {
  retref: string;
  amount: string; // dollar string
  fundingdate: string; // MMDD
  fundingstatus: string; // settlement status
  achreturncode?: string; // R01, R02, etc.
  achreturndescription?: string; // human-readable return reason
  batchid?: string;
}
