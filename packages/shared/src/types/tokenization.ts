/**
 * Provider-agnostic tokenization types.
 *
 * All card/wallet tokenizers normalize their output to `TokenizeResult`
 * so payment capture components never depend on a specific gateway.
 */

/** How the token was obtained. */
export type TokenSource =
  | 'hosted_iframe'
  | 'apple_pay'
  | 'google_pay'
  | 'card_reader'
  | 'stored_profile'
  | 'server_tokenize';

/** Normalized output from any tokenizer. */
export interface TokenizeResult {
  /** Provider code that produced the token (e.g. 'cardpointe', 'stripe'). */
  provider: string;
  /** Opaque provider token — never log in full. */
  token: string;
  /** Last 4 digits of the card (extracted from token or wallet data). */
  last4: string | null;
  /** Card brand: 'visa' | 'mastercard' | 'amex' | 'discover' | etc. */
  brand: string | null;
  /** Expiry month 1-12. */
  expMonth: number | null;
  /** Expiry year (4-digit). */
  expYear: number | null;
  /** How the token was obtained. */
  source: TokenSource;
  /** Provider-specific extras (e.g. BIN, funding type). */
  metadata: Record<string, unknown>;
}

/**
 * Client-side configuration returned by the tokenizer-config API.
 *
 * Tells the frontend which provider to render and whether wallets are available.
 */
export interface TokenizerClientConfig {
  /** Provider code (determines which tokenizer component to render). */
  providerCode: string;
  /** Whether this is a sandbox/test environment. */
  isSandbox: boolean;
  /** Hosted iframe configuration (CardPointe, etc.). */
  iframe?: {
    site: string;
    iframeUrl: string;
  };
  /** Digital wallet availability flags. */
  wallets?: {
    applePay: boolean;
    googlePay: boolean;
    /** Google Pay gateway merchant ID (required when googlePay is true). */
    googlePayMerchantId?: string;
    /** Google Pay gateway ID for CardConnect (required when googlePay is true). */
    googlePayGatewayId?: string;
  };
}
