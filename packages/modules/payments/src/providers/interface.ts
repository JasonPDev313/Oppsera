// ── Provider-agnostic payment interface ──────────────────────────
// All payment providers (CardPointe, Square, Worldpay) implement this interface.
// The PaymentsFacade routes operations through the active provider.

export interface AuthorizeRequest {
  merchantId: string;
  amount: string; // dollar string: "100.00"
  currency: string;
  token: string; // CardSecure token or stored token
  expiry?: string; // MMYY
  cvv?: string;
  orderId: string; // provider-safe order ID (max 19 chars)
  capture: 'Y' | 'N';
  ecomind: 'E' | 'R' | 'T'; // ecommerce, recurring, terminal
  name?: string;
  address?: string;
  postal?: string;
  receipt?: 'Y' | 'N';
  userfields?: Record<string, string>;
  // ── ACH-specific fields ──
  achAccountType?: 'ECHK' | 'ESAV'; // checking | savings
  achSecCode?: 'CCD' | 'PPD' | 'TEL' | 'WEB';
  achDescription?: string; // "Reversal" for ACH refunds, or custom description
  bankaba?: string; // ABA routing number (only for account validation)
}

export interface AuthorizeResponse {
  providerRef: string; // retref
  authCode: string | null;
  amount: string; // dollar string
  status: 'approved' | 'declined' | 'retry';
  responseCode: string;
  responseText: string;
  token: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  avsResponse: string | null;
  cvvResponse: string | null;
  rawResponse: Record<string, unknown>;
}

export interface CaptureRequest {
  merchantId: string;
  providerRef: string; // retref
  amount?: string; // optional partial capture
}

export interface CaptureResponse {
  providerRef: string;
  amount: string;
  status: 'approved' | 'declined' | 'retry';
  responseCode: string;
  responseText: string;
  rawResponse: Record<string, unknown>;
}

export type SaleRequest = AuthorizeRequest;

export type SaleResponse = AuthorizeResponse;

export interface VoidRequest {
  merchantId: string;
  providerRef: string;
}

export interface VoidResponse {
  providerRef: string;
  status: 'approved' | 'declined' | 'retry';
  responseCode: string;
  responseText: string;
  rawResponse: Record<string, unknown>;
}

export interface RefundRequest {
  merchantId: string;
  providerRef: string;
  amount?: string; // optional partial refund
}

export interface RefundResponse {
  providerRef: string;
  amount: string;
  status: 'approved' | 'declined' | 'retry';
  responseCode: string;
  responseText: string;
  rawResponse: Record<string, unknown>;
}

export interface InquireResponse {
  providerRef: string;
  amount: string;
  status: 'approved' | 'declined' | 'retry';
  responseCode: string;
  responseText: string;
  authCode: string | null;
  settled: boolean;
  rawResponse: Record<string, unknown>;
}

export interface TokenizeRequest {
  account: string; // card number or encrypted track
  expiry?: string; // MMYY
}

export interface TokenizeResponse {
  token: string;
  cardLast4: string | null;
  cardBrand: string | null;
  expiry: string | null;
}

export interface CreateProfileRequest {
  merchantId: string;
  token: string;
  expiry: string;
  name?: string;
  address?: string;
  postal?: string;
  profileUpdate?: 'Y'; // set when adding to existing profile
  existingProfileId?: string;
}

export interface CreateProfileResponse {
  profileId: string;
  accountId: string;
  token: string;
  cardLast4: string | null;
  cardBrand: string | null;
}

export interface ProfileResponse {
  profileId: string;
  accountId: string;
  token: string;
  cardLast4: string | null;
  cardBrand: string | null;
  expiry: string | null;
  name: string | null;
}

export interface SettlementStatusResponse {
  merchantId: string;
  date: string;
  transactions: SettlementTransaction[];
  rawResponse: Record<string, unknown>;
}

export interface SettlementTransaction {
  providerRef: string;
  amount: string;
  status: string;
  batchId: string;
}

// ── ACH Funding Status ──────────────────────────────────────────
// CardPointe funding endpoint returns ACH settlement/return data.

export interface FundingStatusResponse {
  merchantId: string;
  date: string;
  fundingTransactions: FundingTransaction[];
  rawResponse: Record<string, unknown>;
}

export interface FundingTransaction {
  providerRef: string; // retref
  amount: string; // dollar string
  fundingStatus: 'originated' | 'settled' | 'returned' | 'rejected';
  achReturnCode: string | null; // R01, R02, etc. (null if not returned)
  achReturnDescription: string | null;
  fundingDate: string; // YYYY-MM-DD
  batchId: string | null;
}

export interface VoidByOrderIdRequest {
  merchantId: string;
  orderId: string;
}

/**
 * Payment provider interface — all providers must implement this.
 * Amount strings are in dollars (e.g., "100.00"), not cents.
 */
export interface PaymentProvider {
  readonly code: string;

  // Core transaction operations
  authorize(request: AuthorizeRequest): Promise<AuthorizeResponse>;
  capture(request: CaptureRequest): Promise<CaptureResponse>;
  sale(request: SaleRequest): Promise<SaleResponse>;
  void(request: VoidRequest): Promise<VoidResponse>;
  refund(request: RefundRequest): Promise<RefundResponse>;

  // Status
  inquire(providerRef: string, merchantId: string): Promise<InquireResponse>;
  inquireByOrderId(orderId: string, merchantId: string): Promise<InquireResponse | null>;

  // Tokenization & profiles
  tokenize(request: TokenizeRequest): Promise<TokenizeResponse>;
  createProfile(request: CreateProfileRequest): Promise<CreateProfileResponse>;
  getProfile(profileId: string, merchantId: string, acctId?: string): Promise<ProfileResponse>;
  deleteProfile(profileId: string, merchantId: string, acctId?: string): Promise<void>;

  // Settlement
  getSettlementStatus(date: string, merchantId: string): Promise<SettlementStatusResponse>;

  // ACH Funding (optional — only providers with ACH support)
  getFundingStatus?(date: string, merchantId: string): Promise<FundingStatusResponse>;

  // Signature
  captureSignature(providerRef: string, merchantId: string, signature: string): Promise<void>;

  // Timeout recovery
  voidByOrderId(request: VoidByOrderIdRequest): Promise<VoidResponse>;
}

/**
 * Credentials needed to instantiate a provider.
 * Provider-specific — CardPointe needs site/username/password.
 */
export interface ProviderCredentials {
  site: string;
  username: string;
  password: string;
  [key: string]: string; // allow provider-specific extras
}
