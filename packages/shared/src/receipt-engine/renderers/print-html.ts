/**
 * Print HTML Receipt Renderer
 *
 * Renders a ReceiptDocument to styled HTML for browser window.print() via hidden iframe.
 * - Uses @page { size: 80mm auto; margin: 0; } for thermal printer compatibility
 * - Monospace-based for consistent character alignment
 * - Richer than plain thermal text — uses CSS for bold totals, indented modifiers, QR image
 * - Self-contained HTML document ready for iframe injection
 */

import type {
  ReceiptDocument,
  ReceiptBlock,
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
  ReceiptItem,
} from '../types';
import { CHARS_PER_LINE } from '../types';

// ── Helpers ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatMoneyWithSign(cents: number): string {
  return `$${formatMoney(cents)}`;
}

function formatReceiptDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Block renderers ──────────────────────────────────────────────

function renderHeader(block: HeaderBlock): string {
  const parts: string[] = [];
  parts.push('<div class="header">');

  if (block.logoUrl) {
    parts.push(`<img src="${escapeHtml(block.logoUrl)}" alt="" class="logo" />`);
  }

  parts.push(`<div class="biz-name">${escapeHtml(block.businessName.toUpperCase())}</div>`);

  if (block.locationName) {
    parts.push(`<div class="loc-name">${escapeHtml(block.locationName)}</div>`);
  }

  for (const addr of block.addressLines) {
    parts.push(`<div class="sub-text">${escapeHtml(addr)}</div>`);
  }

  if (block.phone) {
    parts.push(`<div class="sub-text">${escapeHtml(block.phone)}</div>`);
  }

  if (block.taxId) {
    parts.push(`<div class="sub-text dim">Tax ID: ${escapeHtml(block.taxId)}</div>`);
  }

  for (const custom of block.customLines) {
    parts.push(`<div class="sub-text">${escapeHtml(custom)}</div>`);
  }

  parts.push('</div>');
  return parts.join('\n');
}

function renderOrderInfo(block: OrderInfoBlock): string {
  const parts: string[] = [];
  parts.push('<div class="sep"></div>');
  parts.push('<div class="order-info">');

  const typePart = block.orderType ? ` &middot; ${escapeHtml(block.orderType)}` : '';
  parts.push(`<div class="row"><span>Order: <strong>${escapeHtml(block.orderNumber)}</strong>${typePart}</span><span></span></div>`);
  parts.push(`<div class="row"><span>Date:</span><span>${escapeHtml(formatReceiptDate(block.orderDate))}</span></div>`);

  if (block.serverName) parts.push(`<div class="row"><span>Server:</span><span>${escapeHtml(block.serverName)}</span></div>`);
  if (block.terminalId) parts.push(`<div class="row"><span>Terminal:</span><span>${escapeHtml(block.terminalId)}</span></div>`);
  if (block.tableNumber) parts.push(`<div class="row"><span>Table:</span><span>${escapeHtml(block.tableNumber)}</span></div>`);
  if (block.checkNumber) parts.push(`<div class="row"><span>Check:</span><span>${escapeHtml(block.checkNumber)}</span></div>`);
  if (block.guestCount != null && block.guestCount > 0) {
    parts.push(`<div class="row"><span>Guests:</span><span>${block.guestCount}</span></div>`);
  }

  parts.push('</div>');
  parts.push('<div class="sep"></div>');
  return parts.join('\n');
}

function renderSingleItem(item: ReceiptItem, showPrices: boolean, showModifiers: boolean, showInstructions: boolean): string {
  const parts: string[] = [];

  // Item name with markers
  let nameHtml = '';
  if (item.isVoided) nameHtml += '<span class="badge void">VOID</span> ';
  else if (item.isComped) nameHtml += '<span class="badge comp">COMP</span> ';
  nameHtml += escapeHtml(item.name);

  parts.push(`<div class="item-name">${nameHtml}</div>`);

  // Qty x price
  if (showPrices) {
    parts.push(`<div class="row indent"><span>${item.qty} x ${formatMoney(item.unitPriceCents)}</span><span>${formatMoney(item.lineTotalCents)}</span></div>`);
  } else {
    parts.push(`<div class="indent dim">Qty: ${item.qty}</div>`);
  }

  // Modifiers
  if (showModifiers && item.modifiers.length > 0) {
    for (const mod of item.modifiers) {
      if (mod.priceCents !== 0 && showPrices) {
        parts.push(`<div class="row indent2"><span>+ ${escapeHtml(mod.name)}</span><span>${formatMoney(mod.priceCents)}</span></div>`);
      } else {
        parts.push(`<div class="indent2 dim">+ ${escapeHtml(mod.name)}</div>`);
      }
    }
  }

  // Special instructions
  if (showInstructions && item.specialInstructions) {
    parts.push(`<div class="indent2 instructions">&ldquo;${escapeHtml(item.specialInstructions)}&rdquo;</div>`);
  }

  // Discount label
  if (item.discountLabel && showPrices) {
    parts.push(`<div class="indent2 discount">${escapeHtml(item.discountLabel)}</div>`);
  }

  return parts.join('\n');
}

function renderItems(block: ItemsBlock): string {
  const parts: string[] = [];
  parts.push('<div class="items">');

  if (block.groupBySeat) {
    const seatMap = new Map<number | null, ReceiptItem[]>();
    for (const item of block.items) {
      const seat = item.seatNumber;
      if (!seatMap.has(seat)) seatMap.set(seat, []);
      seatMap.get(seat)!.push(item);
    }
    for (const [seat, seatItems] of seatMap) {
      if (seat != null) {
        parts.push(`<div class="seat-header">── Seat ${seat} ──</div>`);
      }
      for (const item of seatItems) parts.push(renderSingleItem(item, block.showPrices, block.showModifiers, block.showSpecialInstructions));
    }
  } else {
    for (const item of block.items) {
      parts.push(renderSingleItem(item, block.showPrices, block.showModifiers, block.showSpecialInstructions));
    }
  }

  parts.push('</div>');
  return parts.join('\n');
}

function renderTotals(block: TotalsBlock): string {
  const parts: string[] = [];
  parts.push('<div class="sep"></div>');
  parts.push('<div class="totals">');

  parts.push(`<div class="row"><span>Subtotal</span><span>${formatMoney(block.subtotalCents)}</span></div>`);

  for (const disc of block.discounts) {
    parts.push(`<div class="row discount"><span>${escapeHtml(disc.label)}</span><span>-${formatMoney(disc.amountCents)}</span></div>`);
  }

  for (const charge of block.charges) {
    parts.push(`<div class="row"><span>${escapeHtml(charge.label)}</span><span>${formatMoney(charge.amountCents)}</span></div>`);
  }

  if (block.taxBreakdown && block.taxBreakdown.length > 0) {
    for (const tax of block.taxBreakdown) {
      parts.push(`<div class="row dim indent"><span>${escapeHtml(tax.name)} (${escapeHtml(tax.rate)})</span><span>${formatMoney(tax.amountCents)}</span></div>`);
    }
  } else if (block.taxCents > 0) {
    parts.push(`<div class="row"><span>Tax</span><span>${formatMoney(block.taxCents)}</span></div>`);
  }

  parts.push('</div>');
  parts.push('<div class="sep-thick"></div>');
  parts.push(`<div class="grand-total"><div class="row"><span>TOTAL</span><span>${formatMoneyWithSign(block.totalCents)}</span></div></div>`);
  parts.push('<div class="sep-thick"></div>');

  return parts.join('\n');
}

function renderPayment(block: PaymentBlock): string {
  if (block.tenders.length === 0) return '';

  const parts: string[] = [];
  parts.push('<div class="payment">');

  for (const tender of block.tenders) {
    let label = escapeHtml(tender.label);
    if (tender.cardBrand && tender.cardLast4) {
      label = `${escapeHtml(tender.cardBrand)} ****${escapeHtml(tender.cardLast4)}`;
    } else if (tender.cardLast4) {
      label = `CARD ****${escapeHtml(tender.cardLast4)}`;
    }
    parts.push(`<div class="row"><span>${label}</span><span>${formatMoney(tender.amountCents)}</span></div>`);

    if (tender.authCode) {
      parts.push(`<div class="row indent dim"><span>Auth:</span><span>${escapeHtml(tender.authCode)}</span></div>`);
    }
    if (tender.surchargeAmountCents > 0) {
      parts.push(`<div class="row indent dim"><span>Surcharge</span><span>${formatMoney(tender.surchargeAmountCents)}</span></div>`);
    }
    if (tender.tipCents > 0) {
      parts.push(`<div class="row indent dim"><span>Tip</span><span>${formatMoney(tender.tipCents)}</span></div>`);
    }
  }

  if (block.changeCents > 0) {
    parts.push(`<div class="row"><span>Change</span><span>${formatMoney(block.changeCents)}</span></div>`);
  }

  if (block.totalTipCents > 0 && block.tenders.length > 1) {
    parts.push(`<div class="row" style="margin-top:6px;"><span><strong>Total Tips</strong></span><span>${formatMoney(block.totalTipCents)}</span></div>`);
  }

  parts.push('</div>');
  parts.push('<div class="sep"></div>');
  return parts.join('\n');
}

function renderFooter(block: FooterBlock): string {
  const parts: string[] = [];
  parts.push('<div class="footer">');

  if (block.giftMessage) {
    parts.push(`<div class="gift-msg">${escapeHtml(block.giftMessage)}</div>`);
  }

  if (block.showReturnPolicy && block.returnPolicyText) {
    parts.push('<div class="sep"></div>');
    parts.push(`<div class="return-policy">${escapeHtml(block.returnPolicyText)}</div>`);
    parts.push('<div class="sep"></div>');
  }

  for (const custom of block.customLines) {
    parts.push(`<div class="center dim">${escapeHtml(custom)}</div>`);
  }

  parts.push(`<div class="center thank-you">${escapeHtml(block.thankYouMessage)}</div>`);
  parts.push('</div>');
  return parts.join('\n');
}

function renderQrCode(block: QrCodeBlock): string {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(block.url)}&size=120x120`;
  return `<div class="qr-section">
  <img src="${escapeHtml(qrUrl)}" alt="QR Code" width="120" height="120" />
  <div class="dim">${escapeHtml(block.label)}</div>
</div>`;
}

function renderLoyalty(block: LoyaltyBlock): string {
  const parts: string[] = [];
  parts.push('<div class="sep"></div>');
  parts.push('<div class="loyalty">');
  if (block.memberName) parts.push(`<div class="row"><span>Member:</span><span>${escapeHtml(block.memberName)}</span></div>`);
  if (block.memberNumber) parts.push(`<div class="row"><span>Member #:</span><span>${escapeHtml(block.memberNumber)}</span></div>`);
  if (block.pointsEarned > 0) parts.push(`<div class="row"><span>Points Earned:</span><span>+${block.pointsEarned}</span></div>`);
  if (block.pointsBalance > 0) parts.push(`<div class="row"><span>Points Balance:</span><span>${block.pointsBalance}</span></div>`);
  parts.push('</div>');
  parts.push('<div class="sep"></div>');
  return parts.join('\n');
}

function renderSignature(block: SignatureBlock, w: number): string {
  const lineW = Math.floor(w * 0.6);
  const sigLine = '─'.repeat(lineW);

  const parts: string[] = [];
  parts.push('<div class="signature">');

  if (block.showTipLine) {
    parts.push(`<div class="row"><span>Tip:</span><span>${sigLine}</span></div>`);
    parts.push('<div>&nbsp;</div>');
    parts.push(`<div class="row"><span>Total:</span><span>${sigLine}</span></div>`);
  }

  if (block.showSignatureLine) {
    parts.push('<div>&nbsp;</div>');
    parts.push('<div>&nbsp;</div>');
    parts.push(`<div>x${'─'.repeat(w - 1)}</div>`);
    parts.push('<div class="center dim">Signature</div>');
  }

  parts.push('</div>');
  return parts.join('\n');
}

function renderWatermark(block: WatermarkBlock): string {
  return `<div class="watermark">*** ${escapeHtml(block.text)} ***</div>`;
}

function renderRefundInfo(block: RefundInfoBlock): string {
  return `<div class="refund-info">
  <div class="row"><span>Original Order:</span><span>${escapeHtml(block.originalOrderNumber)}</span></div>
  <div class="row"><span>Refund Amount:</span><span>${formatMoneyWithSign(block.refundAmountCents)}</span></div>
  <div class="row"><span>Refund Method:</span><span>${escapeHtml(block.refundMethod)}</span></div>
</div>`;
}

function renderVoidInfo(block: VoidInfoBlock): string {
  const parts: string[] = [];
  parts.push('<div class="void-info">');
  parts.push('<div class="center"><strong>*** VOIDED ***</strong></div>');
  parts.push(`<div class="row"><span>Voided:</span><span>${escapeHtml(formatReceiptDate(block.voidedAt))}</span></div>`);
  if (block.voidReason) parts.push(`<div class="row"><span>Reason:</span><span>${escapeHtml(block.voidReason)}</span></div>`);
  if (block.voidedBy) parts.push(`<div class="row"><span>By:</span><span>${escapeHtml(block.voidedBy)}</span></div>`);
  parts.push('</div>');
  return parts.join('\n');
}

function renderReprintInfo(block: ReprintInfoBlock): string {
  const parts: string[] = [];
  parts.push('<div class="reprint-info">');
  parts.push(`<div class="row"><span>Original:</span><span>${escapeHtml(formatReceiptDate(block.originalDate))}</span></div>`);
  if (block.reprintReason) parts.push(`<div class="row"><span>Reason:</span><span>${escapeHtml(block.reprintReason)}</span></div>`);
  parts.push('</div>');
  return parts.join('\n');
}

// ── Block dispatch ───────────────────────────────────────────────

function renderBlock(block: ReceiptBlock, w: number): string {
  switch (block.type) {
    case 'header': return renderHeader(block);
    case 'order_info': return renderOrderInfo(block);
    case 'items': return renderItems(block);
    case 'totals': return renderTotals(block);
    case 'payment': return renderPayment(block);
    case 'footer': return renderFooter(block);
    case 'qr_code': return renderQrCode(block);
    case 'loyalty': return renderLoyalty(block);
    case 'signature': return renderSignature(block, w);
    case 'watermark': return renderWatermark(block);
    case 'refund_info': return renderRefundInfo(block);
    case 'void_info': return renderVoidInfo(block);
    case 'reprint_info': return renderReprintInfo(block);
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Renders a ReceiptDocument to a complete HTML page suitable for
 * printing via hidden iframe with window.print().
 *
 * The HTML uses @page { size: 80mm auto } for thermal printer compatibility
 * and falls back gracefully to standard printers and PDF.
 */
export function renderPrintHtml(doc: ReceiptDocument): string {
  const pw = doc.metadata.printerWidth;
  const widthMm = pw === '58mm' ? '58mm' : '80mm';
  const w = CHARS_PER_LINE[pw];
  const body = doc.blocks.map((block) => renderBlock(block, w)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page {
    size: ${widthMm} auto;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${widthMm};
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    line-height: 1.4;
    color: #000;
    background: #fff;
    padding: 2mm 3mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Layout */
  .header { text-align: center; padding-bottom: 6px; }
  .biz-name { font-size: 14px; font-weight: 700; letter-spacing: 1px; }
  .loc-name { font-size: 12px; }
  .sub-text { font-size: 10px; }
  .logo { max-height: 40px; max-width: 160px; margin-bottom: 4px; }

  .row { display: flex; justify-content: space-between; line-height: 1.5; }
  .center { text-align: center; }
  .indent { padding-left: 8px; }
  .indent2 { padding-left: 16px; }
  .dim { color: #666; font-size: 10px; }
  .discount { color: #16a34a; }
  .instructions { font-style: italic; color: #888; font-size: 10px; }

  /* Separators */
  .sep { border-top: 1px solid #000; margin: 4px 0; }
  .sep-thick { border-top: 2px solid #000; margin: 2px 0; }

  /* Items */
  .item-name { font-weight: 600; margin-top: 4px; }
  .seat-header { font-size: 10px; letter-spacing: 1px; margin-top: 8px; border-bottom: 1px dashed #999; padding-bottom: 2px; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 0 3px; border: 1px solid; border-radius: 2px; }
  .badge.void { color: #dc2626; border-color: #dc2626; }
  .badge.comp { color: #d97706; border-color: #d97706; }

  /* Totals */
  .grand-total { padding: 4px 0; }
  .grand-total .row { font-size: 14px; font-weight: 700; }

  /* Sections */
  .order-info, .items, .totals, .payment, .footer, .loyalty, .signature, .refund-info, .void-info, .reprint-info { padding: 4px 0; }

  /* Watermark */
  .watermark { text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 2px; padding: 6px 0; }

  /* QR Code */
  .qr-section { text-align: center; padding: 8px 0; }
  .qr-section img { display: block; margin: 0 auto 4px; }

  /* Footer */
  .thank-you { font-weight: 600; padding: 6px 0; }
  .gift-msg { text-align: center; font-style: italic; padding: 6px 0; border: 1px dashed #999; margin-bottom: 6px; }
  .return-policy { font-size: 9px; color: #666; padding: 4px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
