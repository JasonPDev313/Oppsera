import type { RequestContext } from '../auth/context';

// ── Input types ─────────────────────────────────────────────────

export interface GatewayAuthorizeInput {
  amountCents: number;
  currency?: string;
  token?: string;
  paymentMethodId?: string;
  orderId?: string;
  customerId?: string;
  tipCents?: number;
  ecomind?: 'E' | 'R' | 'T';
  metadata?: Record<string, unknown>;
  clientRequestId: string;
}

export interface GatewayCaptureInput {
  paymentIntentId: string;
  amountCents?: number;
  tipCents?: number;
  clientRequestId: string;
}

export interface GatewaySaleInput {
  amountCents: number;
  currency?: string;
  token?: string;
  paymentMethodId?: string;
  orderId?: string;
  customerId?: string;
  tipCents?: number;
  ecomind?: 'E' | 'R' | 'T';
  metadata?: Record<string, unknown>;
  clientRequestId: string;
}

export interface GatewayVoidInput {
  paymentIntentId: string;
  clientRequestId: string;
}

export interface GatewayRefundInput {
  paymentIntentId: string;
  amountCents?: number;
  clientRequestId: string;
}

export interface GatewayResult {
  id: string;
  status: string;
  amountCents: number;
  authorizedAmountCents?: number | null;
  capturedAmountCents?: number | null;
  refundedAmountCents?: number | null;
  providerRef?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  errorMessage?: string | null;
}

// ── Interface ───────────────────────────────────────────────────

export interface PaymentsGatewayApi {
  authorize(ctx: RequestContext, input: GatewayAuthorizeInput): Promise<GatewayResult>;
  capture(ctx: RequestContext, input: GatewayCaptureInput): Promise<GatewayResult>;
  sale(ctx: RequestContext, input: GatewaySaleInput): Promise<GatewayResult>;
  void(ctx: RequestContext, input: GatewayVoidInput): Promise<GatewayResult>;
  refund(ctx: RequestContext, input: GatewayRefundInput): Promise<GatewayResult>;
}

// ── Singleton ───────────────────────────────────────────────────

let _api: PaymentsGatewayApi | null = null;

export function getPaymentsGatewayApi(): PaymentsGatewayApi {
  if (!_api) {
    throw new Error(
      'PaymentsGatewayApi not initialized. Call setPaymentsGatewayApi() in instrumentation.ts first.',
    );
  }
  return _api;
}

export function setPaymentsGatewayApi(api: PaymentsGatewayApi): void {
  _api = api;
}

/**
 * Check if the payments gateway is configured.
 * Returns false when no provider credentials are set up (e.g., cash-only tenants).
 */
export function hasPaymentsGateway(): boolean {
  return _api !== null;
}
