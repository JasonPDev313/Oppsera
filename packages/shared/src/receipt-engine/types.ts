/**
 * Receipt Engine — Type Definitions
 *
 * Block-based receipt document architecture. One builder, many renderers.
 * All amounts are in CENTS (integer). Renderers convert to dollars at render time.
 */

// ── Receipt Variants ─────────────────────────────────────────────

export type ReceiptVariant =
  | 'standard'
  | 'merchant'
  | 'gift'
  | 'refund'
  | 'reprint'
  | 'training'
  | 'kitchen';

// ── Block Types (discriminated union on `type`) ──────────────────

export interface HeaderBlock {
  type: 'header';
  businessName: string;
  locationName: string | null;
  addressLines: string[];
  phone: string | null;
  logoUrl: string | null;
  taxId: string | null;
  customLines: string[];
}

export interface OrderInfoBlock {
  type: 'order_info';
  orderNumber: string;
  orderDate: string; // ISO timestamp
  orderType: string | null;
  serverName: string | null;
  terminalId: string | null;
  tableNumber: string | null;
  checkNumber: string | null;
  guestCount: number | null;
}

export interface ReceiptItem {
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  modifiers: { name: string; priceCents: number }[];
  specialInstructions: string | null;
  isVoided: boolean;
  isComped: boolean;
  discountLabel: string | null;
  seatNumber: number | null;
}

export interface ItemsBlock {
  type: 'items';
  items: ReceiptItem[];
  showPrices: boolean;
  showModifiers: boolean;
  showSpecialInstructions: boolean;
  groupBySeat: boolean;
}

export interface TotalsBlock {
  type: 'totals';
  subtotalCents: number;
  discounts: { label: string; amountCents: number }[];
  charges: { label: string; amountCents: number }[];
  taxCents: number;
  taxBreakdown: { name: string; rate: string; amountCents: number }[] | null;
  totalCents: number;
}

export interface ReceiptTender {
  method: string;
  label: string;
  amountCents: number;
  cardLast4: string | null;
  cardBrand: string | null;
  authCode: string | null;
  surchargeAmountCents: number;
  tipCents: number;
}

export interface PaymentBlock {
  type: 'payment';
  tenders: ReceiptTender[];
  totalChargedCents: number;
  changeCents: number;
  totalTipCents: number;
}

export interface FooterBlock {
  type: 'footer';
  thankYouMessage: string;
  showReturnPolicy: boolean;
  returnPolicyText: string;
  customLines: string[];
  giftMessage: string | null;
}

export interface QrCodeBlock {
  type: 'qr_code';
  url: string;
  label: string;
}

export interface LoyaltyBlock {
  type: 'loyalty';
  pointsEarned: number;
  pointsBalance: number;
  memberName: string | null;
  memberNumber: string | null;
}

export interface SignatureBlock {
  type: 'signature';
  showTipLine: boolean;
  showSignatureLine: boolean;
}

export type WatermarkText =
  | 'REPRINT'
  | 'TRAINING'
  | 'DUPLICATE'
  | 'VOID'
  | 'GIFT RECEIPT';

export interface WatermarkBlock {
  type: 'watermark';
  text: WatermarkText;
}

export interface RefundInfoBlock {
  type: 'refund_info';
  originalOrderNumber: string;
  refundAmountCents: number;
  refundMethod: string;
}

export interface VoidInfoBlock {
  type: 'void_info';
  voidedAt: string;
  voidReason: string | null;
  voidedBy: string | null;
}

export interface ReprintInfoBlock {
  type: 'reprint_info';
  originalDate: string;
  reprintReason: string | null;
}

// ── Discriminated Union ──────────────────────────────────────────

export type ReceiptBlock =
  | HeaderBlock
  | OrderInfoBlock
  | ItemsBlock
  | TotalsBlock
  | PaymentBlock
  | FooterBlock
  | QrCodeBlock
  | LoyaltyBlock
  | SignatureBlock
  | WatermarkBlock
  | RefundInfoBlock
  | VoidInfoBlock
  | ReprintInfoBlock;

// ── Printer Width ────────────────────────────────────────────────

export type PrinterWidth = '58mm' | '80mm';

export const CHARS_PER_LINE: Record<PrinterWidth, number> = {
  '58mm': 32,
  '80mm': 42,
};

// ── Receipt Document ─────────────────────────────────────────────

export interface ReceiptDocumentMetadata {
  orderId: string;
  tenantId: string;
  locationId: string;
  generatedAt: string; // ISO timestamp
  printerWidth: PrinterWidth;
}

export interface ReceiptDocument {
  variant: ReceiptVariant;
  blocks: ReceiptBlock[];
  metadata: ReceiptDocumentMetadata;
}

// ── Builder Input ────────────────────────────────────────────────

export interface BuildReceiptInput {
  // Order data
  orderId: string;
  orderNumber: string;
  orderDate: string;
  orderType?: string | null;
  terminalId?: string | null;
  serverName?: string | null;
  tableNumber?: string | null;
  checkNumber?: string | null;
  guestCount?: number | null;

  // Line items (cents)
  items: ReceiptItem[];

  // Financial summary (cents)
  subtotalCents: number;
  discounts: { label: string; amountCents: number }[];
  charges: { label: string; amountCents: number }[];
  taxCents: number;
  taxBreakdown?: { name: string; rate: string; amountCents: number }[];
  totalCents: number;

  // Tenders
  tenders: ReceiptTender[];
  changeCents: number;

  // Business info
  businessName: string;
  locationName?: string | null;
  addressLines: string[];
  phone?: string | null;
  logoUrl?: string | null;
  taxId?: string | null;
  tenantSlug?: string;
  receiptToken?: string;

  // Customer/loyalty
  customerName?: string | null;
  loyaltyPointsEarned?: number | null;
  loyaltyPointsBalance?: number | null;
  memberNumber?: string | null;

  // Config
  settings: import('../schemas/receipt-settings').ReceiptSettings;
  variant: ReceiptVariant;
  tenantId: string;
  locationId: string;

  // Variant-specific
  refundInfo?: {
    originalOrderNumber: string;
    refundAmountCents: number;
    refundMethod: string;
  };
  reprintInfo?: { originalDate: string; reprintReason?: string };
  voidInfo?: {
    voidedAt: string;
    voidReason?: string;
    voidedBy?: string;
  };
  giftMessage?: string;
}
