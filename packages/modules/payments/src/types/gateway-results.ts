import type { PaymentIntentStatus } from '../events/gateway-types';

/** Result returned from authorize, capture, sale, void, refund, inquire operations. */
export interface PaymentIntentResult {
  id: string;
  tenantId: string;
  locationId: string;
  status: PaymentIntentStatus;
  amountCents: number;
  currency: string;
  authorizedAmountCents: number | null;
  capturedAmountCents: number | null;
  refundedAmountCents: number | null;
  orderId: string | null;
  customerId: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  providerRef: string | null; // latest provider reference (retref)
  errorMessage: string | null;
  // ── Response enrichment fields ──
  userMessage: string | null;
  suggestedAction: string | null;
  declineCategory: string | null;
  retryable: boolean;
  avsResult: string | null;
  cvvResult: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Result returned from tokenize operations. */
export interface TokenResult {
  token: string;
  cardLast4: string | null;
  cardBrand: string | null;
  expiry: string | null;
}

/** Result returned from createProfile operations. */
export interface PaymentProfileResult {
  paymentMethodId: string; // our customer_payment_methods.id
  providerProfileId: string;
  providerAccountId: string;
  cardLast4: string | null;
  cardBrand: string | null;
  customerId: string;
}
