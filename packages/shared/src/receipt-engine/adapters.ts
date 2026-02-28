/**
 * Receipt Engine — Backward Compatibility Adapters
 *
 * Maps legacy POS and F&B data types to the new BuildReceiptInput format.
 */

import type { BuildReceiptInput, ReceiptItem, ReceiptTender, ReceiptVariant } from './types';
import type { ReceiptSettings } from '../schemas/receipt-settings';
import { DEFAULT_RECEIPT_SETTINGS } from '../schemas/receipt-settings';

// ── Legacy POS types (from pos-printer.ts) ───────────────────────

export interface LegacyOrderForReceipt {
  orderNumber: string;
  createdAt: string;
  status: string;
  terminalId?: string | null;
  subtotal: number;
  discountTotal: number;
  serviceChargeTotal: number;
  taxTotal: number;
  total: number;
  lines?: Array<{
    id: string;
    catalogItemName: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    sortOrder: number;
    modifiers?: Array<{ name: string; priceAdjustment: number }>;
    specialInstructions?: string | null;
  }>;
  charges?: Array<{
    name: string;
    calculationType: string;
    value: number;
    amount: number;
  }>;
  discounts?: Array<{
    type: string;
    value: number;
    amount: number;
  }>;
}

export interface LegacyTenderForReceipt {
  tenderType: string;
  amount: number;
  tipAmount: number;
  changeGiven: number;
  isReversed: boolean;
  cardLast4?: string | null;
  cardBrand?: string | null;
  authCode?: string | null;
  surchargeAmountCents?: number;
}

// ── Adapter: Legacy Order → BuildReceiptInput ────────────────────

const TENDER_LABELS: Record<string, string> = {
  cash: 'CASH',
  card: 'CARD',
  gift_card: 'GIFT CARD',
  store_credit: 'STORE CREDIT',
  house_account: 'HOUSE ACCT',
  check: 'CHECK',
};

export function orderForReceiptToInput(
  order: LegacyOrderForReceipt,
  businessName: string,
  locationName: string,
  tenders?: LegacyTenderForReceipt[],
  settings?: Partial<ReceiptSettings>,
  options?: {
    variant?: ReceiptVariant;
    tenantId?: string;
    locationId?: string;
    tenantSlug?: string;
    receiptToken?: string;
    addressLines?: string[];
    phone?: string | null;
  },
): BuildReceiptInput {
  const orderLines = [...(order.lines ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const items: ReceiptItem[] = orderLines.map((line) => ({
    name: line.catalogItemName,
    qty: line.qty,
    unitPriceCents: line.unitPrice,
    lineTotalCents: line.lineTotal,
    modifiers: (line.modifiers ?? []).map((m) => ({
      name: m.name,
      priceCents: m.priceAdjustment,
    })),
    specialInstructions: line.specialInstructions ?? null,
    isVoided: false,
    isComped: false,
    discountLabel: null,
    seatNumber: null,
  }));

  const discounts: BuildReceiptInput['discounts'] = (order.discounts ?? []).map((d) => ({
    label: d.type === 'percentage' ? `Discount (${d.value}%)` : 'Discount',
    amountCents: d.amount,
  }));

  const charges: BuildReceiptInput['charges'] = (order.charges ?? []).map((c) => ({
    label:
      c.calculationType === 'percentage'
        ? `${c.name} (${c.value}%)`
        : c.name,
    amountCents: c.amount,
  }));

  const activeTenders = (tenders ?? []).filter((t) => !t.isReversed);
  const mappedTenders: ReceiptTender[] = activeTenders.map((t) => ({
    method: t.tenderType,
    label: TENDER_LABELS[t.tenderType] ?? t.tenderType.toUpperCase(),
    amountCents: t.amount,
    cardLast4: t.cardLast4 ?? null,
    cardBrand: t.cardBrand ?? null,
    authCode: t.authCode ?? null,
    surchargeAmountCents: t.surchargeAmountCents ?? 0,
    tipCents: t.tipAmount,
  }));

  const changeCents = activeTenders.reduce((sum, t) => sum + t.changeGiven, 0);

  return {
    orderId: '',
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    terminalId: order.terminalId ?? null,
    items,
    subtotalCents: order.subtotal,
    discounts,
    charges,
    taxCents: order.taxTotal,
    totalCents: order.total,
    tenders: mappedTenders,
    changeCents,
    businessName,
    locationName,
    addressLines: options?.addressLines ?? [],
    phone: options?.phone ?? null,
    settings: { ...DEFAULT_RECEIPT_SETTINGS, ...settings },
    variant: options?.variant ?? 'standard',
    tenantId: options?.tenantId ?? '',
    locationId: options?.locationId ?? '',
    tenantSlug: options?.tenantSlug,
    receiptToken: options?.receiptToken,
  };
}

// ── Adapter: F&B Tab → BuildReceiptInput ─────────────────────────

export interface FnbTabForReceipt {
  id: string;
  tabNumber?: string | null;
  tableNumber?: string | null;
  serverName?: string | null;
  guestCount?: number | null;
  checkNumber?: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    name: string;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
    seatNumber?: number | null;
    modifiers?: Array<{ name: string; priceCents: number }>;
    specialInstructions?: string | null;
    isVoided?: boolean;
    isComped?: boolean;
  }>;
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  totalCents: number;
  discounts?: Array<{ label: string; amountCents: number }>;
  charges?: Array<{ label: string; amountCents: number }>;
}

export function fnbTabToInput(
  tab: FnbTabForReceipt,
  restaurantName: string,
  tenders?: LegacyTenderForReceipt[],
  settings?: Partial<ReceiptSettings>,
  options?: {
    variant?: ReceiptVariant;
    tenantId?: string;
    locationId?: string;
    tenantSlug?: string;
    receiptToken?: string;
    addressLines?: string[];
    phone?: string | null;
  },
): BuildReceiptInput {
  const items: ReceiptItem[] = tab.lines.map((line) => ({
    name: line.name,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    lineTotalCents: line.lineTotalCents,
    modifiers: line.modifiers ?? [],
    specialInstructions: line.specialInstructions ?? null,
    isVoided: line.isVoided ?? false,
    isComped: line.isComped ?? false,
    discountLabel: null,
    seatNumber: line.seatNumber ?? null,
  }));

  const activeTenders = (tenders ?? []).filter((t) => !t.isReversed);
  const mappedTenders: ReceiptTender[] = activeTenders.map((t) => ({
    method: t.tenderType,
    label: TENDER_LABELS[t.tenderType] ?? t.tenderType.toUpperCase(),
    amountCents: t.amount,
    cardLast4: t.cardLast4 ?? null,
    cardBrand: t.cardBrand ?? null,
    authCode: t.authCode ?? null,
    surchargeAmountCents: t.surchargeAmountCents ?? 0,
    tipCents: t.tipAmount,
  }));

  const changeCents = activeTenders.reduce((sum, t) => sum + t.changeGiven, 0);

  const discounts = tab.discounts ?? (tab.discountCents > 0
    ? [{ label: 'Discount', amountCents: tab.discountCents }]
    : []);

  const charges = tab.charges ?? (tab.serviceChargeCents > 0
    ? [{ label: 'Service Charge', amountCents: tab.serviceChargeCents }]
    : []);

  return {
    orderId: tab.id,
    orderNumber: tab.tabNumber ?? tab.id.slice(-6),
    orderDate: tab.createdAt,
    orderType: 'Dine-In',
    serverName: tab.serverName ?? null,
    tableNumber: tab.tableNumber ?? null,
    checkNumber: tab.checkNumber ?? null,
    guestCount: tab.guestCount ?? null,
    items,
    subtotalCents: tab.subtotalCents,
    discounts,
    charges,
    taxCents: tab.taxCents,
    totalCents: tab.totalCents,
    tenders: mappedTenders,
    changeCents,
    businessName: restaurantName,
    locationName: null,
    addressLines: options?.addressLines ?? [],
    phone: options?.phone ?? null,
    settings: { ...DEFAULT_RECEIPT_SETTINGS, ...settings },
    variant: options?.variant ?? 'standard',
    tenantId: options?.tenantId ?? '',
    locationId: options?.locationId ?? '',
    tenantSlug: options?.tenantSlug,
    receiptToken: options?.receiptToken,
  };
}
