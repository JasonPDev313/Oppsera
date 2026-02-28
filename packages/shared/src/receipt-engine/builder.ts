/**
 * Receipt Document Builder
 *
 * Pure function — no DB, no side effects.
 * Assembles a ReceiptDocument from order data + settings + variant.
 */

import type {
  BuildReceiptInput,
  ReceiptBlock,
  ReceiptDocument,
  HeaderBlock,
  OrderInfoBlock,
  ItemsBlock,
  TotalsBlock,
  PaymentBlock,
  FooterBlock,
  QrCodeBlock,
  LoyaltyBlock,
  SignatureBlock,
  WatermarkBlock,
  RefundInfoBlock,
  VoidInfoBlock,
  ReprintInfoBlock,
  ReceiptVariant,
} from './types';
import type { ReceiptSettings } from '../schemas/receipt-settings';

// ── QR URL template resolver ─────────────────────────────────────

function resolveQrUrl(template: string, tenantSlug?: string, receiptToken?: string): string {
  return template
    .replace('{{tenantSlug}}', tenantSlug ?? '')
    .replace('{{token}}', receiptToken ?? '');
}

// ── Block builders ───────────────────────────────────────────────

function buildHeader(input: BuildReceiptInput, minimal: boolean): HeaderBlock {
  return {
    type: 'header',
    businessName: input.businessName,
    locationName: minimal ? null : (input.locationName ?? null),
    addressLines: minimal ? [] : input.addressLines,
    phone: minimal ? null : (input.settings.showPhone ? (input.phone ?? null) : null),
    logoUrl: input.settings.showLogo ? (input.logoUrl ?? null) : null,
    taxId: input.settings.showTaxId ? (input.taxId ?? null) : null,
    customLines: minimal ? [] : input.settings.customHeaderLines,
  };
}

function buildOrderInfo(input: BuildReceiptInput): OrderInfoBlock {
  return {
    type: 'order_info',
    orderNumber: input.orderNumber,
    orderDate: input.orderDate,
    orderType: input.orderType ?? null,
    serverName: input.serverName ?? null,
    terminalId: input.terminalId ?? null,
    tableNumber: input.tableNumber ?? null,
    checkNumber: input.checkNumber ?? null,
    guestCount: input.guestCount ?? null,
  };
}

function buildItems(input: BuildReceiptInput, showPrices: boolean, simplified: boolean): ItemsBlock {
  return {
    type: 'items',
    items: input.items,
    showPrices,
    showModifiers: simplified ? false : input.settings.showModifiers,
    showSpecialInstructions: simplified ? false : input.settings.showSpecialInstructions,
    groupBySeat: input.settings.itemGroupBySeat,
  };
}

function buildTotals(input: BuildReceiptInput): TotalsBlock {
  return {
    type: 'totals',
    subtotalCents: input.subtotalCents,
    discounts: input.discounts,
    charges: input.charges,
    taxCents: input.taxCents,
    taxBreakdown: input.settings.showTaxBreakdown ? (input.taxBreakdown ?? null) : null,
    totalCents: input.totalCents,
  };
}

function buildPayment(input: BuildReceiptInput): PaymentBlock {
  const totalTipCents = input.tenders.reduce((sum, t) => sum + t.tipCents, 0);
  const totalChargedCents = input.tenders.reduce((sum, t) => sum + t.amountCents, 0);
  return {
    type: 'payment',
    tenders: input.tenders,
    totalChargedCents,
    changeCents: input.changeCents,
    totalTipCents,
  };
}

function buildFooter(input: BuildReceiptInput, s: ReceiptSettings): FooterBlock {
  return {
    type: 'footer',
    thankYouMessage: s.thankYouMessage,
    showReturnPolicy: s.showReturnPolicy,
    returnPolicyText: s.returnPolicyText,
    customLines: s.customFooterLines,
    giftMessage: input.giftMessage ?? null,
  };
}

function buildQrCode(input: BuildReceiptInput, s: ReceiptSettings): QrCodeBlock {
  return {
    type: 'qr_code',
    url: resolveQrUrl(s.qrCodeUrlTemplate, input.tenantSlug, input.receiptToken),
    label: s.qrCodeLabel,
  };
}

function buildLoyalty(input: BuildReceiptInput): LoyaltyBlock {
  return {
    type: 'loyalty',
    pointsEarned: input.loyaltyPointsEarned ?? 0,
    pointsBalance: input.loyaltyPointsBalance ?? 0,
    memberName: input.customerName ?? null,
    memberNumber: input.memberNumber ?? null,
  };
}

function buildSignature(showTipLine: boolean): SignatureBlock {
  return {
    type: 'signature',
    showTipLine,
    showSignatureLine: true,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function hasCardTender(input: BuildReceiptInput): boolean {
  return input.tenders.some(
    (t) => t.method === 'card' || t.cardLast4 != null,
  );
}

// ── Variant assemblers ───────────────────────────────────────────

function assembleStandard(input: BuildReceiptInput, s: ReceiptSettings): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  blocks.push(buildHeader(input, false));
  blocks.push(buildOrderInfo(input));
  blocks.push(buildItems(input, true, false));
  blocks.push(buildTotals(input));
  blocks.push(buildPayment(input));
  if (hasCardTender(input) && s.showSignatureLine) {
    blocks.push(buildSignature(true));
  }
  if (s.showLoyalty && (input.loyaltyPointsEarned != null || input.memberNumber != null)) {
    blocks.push(buildLoyalty(input));
  }
  if (s.showQrCode) {
    blocks.push(buildQrCode(input, s));
  }
  blocks.push(buildFooter(input, s));
  return blocks;
}

function assembleMerchant(input: BuildReceiptInput, s: ReceiptSettings): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  blocks.push(buildHeader(input, false));
  blocks.push(buildOrderInfo(input));
  blocks.push(buildItems(input, true, false));
  blocks.push(buildTotals(input));
  blocks.push(buildPayment(input));
  blocks.push(buildSignature(true));
  blocks.push(buildFooter(input, s));
  return blocks;
}

function assembleGift(input: BuildReceiptInput, s: ReceiptSettings): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  const wm: WatermarkBlock = { type: 'watermark', text: 'GIFT RECEIPT' };
  blocks.push(wm);
  blocks.push(buildHeader(input, false));
  blocks.push(buildOrderInfo(input));
  blocks.push(buildItems(input, false, false)); // no prices on gift
  blocks.push(buildFooter(input, s));
  return blocks;
}

function assembleRefund(input: BuildReceiptInput, s: ReceiptSettings): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  blocks.push(buildHeader(input, false));
  blocks.push(buildOrderInfo(input));
  if (input.refundInfo) {
    const ri: RefundInfoBlock = {
      type: 'refund_info',
      originalOrderNumber: input.refundInfo.originalOrderNumber,
      refundAmountCents: input.refundInfo.refundAmountCents,
      refundMethod: input.refundInfo.refundMethod,
    };
    blocks.push(ri);
  }
  blocks.push(buildItems(input, true, false));
  blocks.push(buildTotals(input));
  blocks.push(buildPayment(input));
  blocks.push(buildFooter(input, s));
  return blocks;
}

function assembleReprint(input: BuildReceiptInput, s: ReceiptSettings): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  const wm: WatermarkBlock = { type: 'watermark', text: 'REPRINT' };
  blocks.push(wm);
  if (input.reprintInfo) {
    const ri: ReprintInfoBlock = {
      type: 'reprint_info',
      originalDate: input.reprintInfo.originalDate,
      reprintReason: input.reprintInfo.reprintReason ?? null,
    };
    blocks.push(ri);
  }
  blocks.push(buildHeader(input, false));
  blocks.push(buildOrderInfo(input));
  blocks.push(buildItems(input, true, false));
  blocks.push(buildTotals(input));
  blocks.push(buildPayment(input));
  if (s.showLoyalty && (input.loyaltyPointsEarned != null || input.memberNumber != null)) {
    blocks.push(buildLoyalty(input));
  }
  if (s.showQrCode) {
    blocks.push(buildQrCode(input, s));
  }
  blocks.push(buildFooter(input, s));
  return blocks;
}

function assembleTraining(input: BuildReceiptInput, s: ReceiptSettings): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  const wm: WatermarkBlock = { type: 'watermark', text: 'TRAINING' };
  blocks.push(wm);
  blocks.push(buildHeader(input, false));
  blocks.push(buildOrderInfo(input));
  blocks.push(buildItems(input, true, false));
  blocks.push(buildTotals(input));
  blocks.push(buildPayment(input));
  blocks.push(buildSignature(true));
  blocks.push(buildFooter(input, s));
  return blocks;
}

function assembleKitchen(input: BuildReceiptInput): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  blocks.push(buildHeader(input, true));
  blocks.push(buildOrderInfo(input));
  blocks.push(buildItems(input, false, true));
  return blocks;
}

// ── Variant dispatch ─────────────────────────────────────────────

const VARIANT_ASSEMBLERS: Record<
  ReceiptVariant,
  (input: BuildReceiptInput, s: ReceiptSettings) => ReceiptBlock[]
> = {
  standard: assembleStandard,
  merchant: assembleMerchant,
  gift: assembleGift,
  refund: assembleRefund,
  reprint: assembleReprint,
  training: assembleTraining,
  kitchen: assembleKitchen,
};

// ── Public API ───────────────────────────────────────────────────

export function buildReceiptDocument(input: BuildReceiptInput): ReceiptDocument {
  const s = input.settings;
  const assembler = VARIANT_ASSEMBLERS[input.variant];
  const blocks = assembler(input, s);

  return {
    variant: input.variant,
    blocks,
    metadata: {
      orderId: input.orderId,
      tenantId: input.tenantId,
      locationId: input.locationId,
      generatedAt: new Date().toISOString(),
      printerWidth: s.printerWidth,
    },
  };
}
