import type { RequestContext } from '../auth/context';

// ── Input types ─────────────────────────────────────────────────

export interface OrdersWriteOpenInput {
  source?: 'pos' | 'online' | 'admin' | 'kiosk' | 'mobile' | 'api';
  notes?: string;
  customerId?: string;
  businessDate?: string;
  terminalId?: string;
  employeeId?: string;
  shiftId?: string;
  metadata?: Record<string, unknown>;
  clientRequestId?: string;
}

export interface OrdersWriteAddLineInput {
  catalogItemId: string;
  qty: number;
  priceOverride?: {
    unitPrice: number;
    reason: 'manager_discount' | 'price_match' | 'comp' | 'custom';
    approvedBy: string;
  };
  notes?: string;
  clientRequestId?: string;
}

export interface OrdersWriteUpdateInput {
  customerId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  clientRequestId?: string;
}

// ── Result types ────────────────────────────────────────────────

export interface OrdersWriteResult {
  id: string;
  orderNumber: string;
  status: string;
  version: number;
}

// ── Interface ───────────────────────────────────────────────────

export interface OrdersWriteApi {
  openOrder(
    ctx: RequestContext,
    input: OrdersWriteOpenInput,
  ): Promise<OrdersWriteResult>;

  addLineItem(
    ctx: RequestContext,
    orderId: string,
    input: OrdersWriteAddLineInput,
  ): Promise<any>;

  updateOrder(
    ctx: RequestContext,
    orderId: string,
    input: OrdersWriteUpdateInput,
  ): Promise<{ orderId: string }>;
}

// ── Singleton ───────────────────────────────────────────────────

let _api: OrdersWriteApi | null = null;

export function getOrdersWriteApi(): OrdersWriteApi {
  if (!_api) throw new Error('OrdersWriteApi not initialized');
  return _api;
}

export function setOrdersWriteApi(api: OrdersWriteApi): void {
  _api = api;
}
