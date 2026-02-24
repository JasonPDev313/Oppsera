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

// Use globalThis to persist across Next.js HMR module reloads in dev mode
const GLOBAL_KEY = '__oppsera_orders_write_api__' as const;

export function getOrdersWriteApi(): OrdersWriteApi {
  const api = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as OrdersWriteApi | undefined;
  if (!api) throw new Error('OrdersWriteApi not initialized');
  return api;
}

export function setOrdersWriteApi(api: OrdersWriteApi): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = api;
}
