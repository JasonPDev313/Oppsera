/**
 * Thermal Receipt Renderer
 *
 * Renders a ReceiptDocument to plain-text lines for thermal printers.
 * Supports 58mm (32 chars) and 80mm (42 chars) widths.
 * Unicode box-drawing separators, smart text wrapping, dynamic column widths.
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

// ── Text helpers ─────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatMoneyWithSign(cents: number): string {
  return `$${formatMoney(cents)}`;
}

function padLine(left: string, right: string, w: number): string {
  const gap = w - left.length - right.length;
  return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right;
}

function centerLine(text: string, w: number): string {
  const gap = w - text.length;
  if (gap <= 0) return text.slice(0, w);
  return ' '.repeat(Math.floor(gap / 2)) + text;
}

function separator(w: number, style: 'thin' | 'thick' | 'double'): string {
  const chars = { thin: '─', thick: '━', double: '═' };
  return chars[style].repeat(w);
}

function wrapText(text: string, w: number, indent: number = 0): string[] {
  if (text.length <= w) return [text];
  const lines: string[] = [];
  const prefix = ' '.repeat(indent);
  const firstW = w;
  const restW = w - indent;
  let remaining = text;
  let first = true;

  while (remaining.length > 0) {
    const maxW = first ? firstW : restW;
    if (remaining.length <= maxW) {
      lines.push(first ? remaining : prefix + remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf(' ', maxW);
    if (breakAt <= 0) breakAt = maxW;
    lines.push((first ? '' : prefix) + remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
    first = false;
  }
  return lines;
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

function renderHeader(block: HeaderBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push(centerLine(block.businessName.toUpperCase(), w));
  if (block.locationName) {
    lines.push(centerLine(block.locationName, w));
  }
  for (const addr of block.addressLines) {
    lines.push(centerLine(addr, w));
  }
  if (block.phone) {
    lines.push(centerLine(block.phone, w));
  }
  if (block.taxId) {
    lines.push(centerLine(`Tax ID: ${block.taxId}`, w));
  }
  for (const custom of block.customLines) {
    lines.push(centerLine(custom, w));
  }
  lines.push('');
  return lines;
}

function renderOrderInfo(block: OrderInfoBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push(separator(w, 'thin'));

  const statusParts: string[] = [];
  if (block.orderType) statusParts.push(block.orderType);

  lines.push(padLine(`Order: ${block.orderNumber}`, statusParts.join(' '), w));
  lines.push(padLine('Date:', formatReceiptDate(block.orderDate), w));

  if (block.serverName) lines.push(padLine('Server:', block.serverName, w));
  if (block.terminalId) lines.push(padLine('Terminal:', block.terminalId, w));
  if (block.tableNumber) lines.push(padLine('Table:', block.tableNumber, w));
  if (block.checkNumber) lines.push(padLine('Check:', block.checkNumber, w));
  if (block.guestCount != null && block.guestCount > 0) {
    lines.push(padLine('Guests:', String(block.guestCount), w));
  }

  lines.push(separator(w, 'thin'));
  lines.push('');
  return lines;
}

function renderItems(block: ItemsBlock, w: number): string[] {
  const lines: string[] = [];

  const renderItem = (item: ReceiptItem) => {
    // Item name with markers
    let namePrefix = '';
    if (item.isVoided) namePrefix = '[VOID] ';
    else if (item.isComped) namePrefix = '[COMP] ';

    const itemName = namePrefix + item.name;
    for (const nameLine of wrapText(itemName, w)) {
      lines.push(nameLine);
    }

    // Qty x price = total
    if (block.showPrices) {
      const qtyStr = `  ${item.qty} x ${formatMoney(item.unitPriceCents)}`;
      lines.push(padLine(qtyStr, formatMoney(item.lineTotalCents), w));
    } else {
      lines.push(`  Qty: ${item.qty}`);
    }

    // Modifiers
    if (block.showModifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        const modStr = `    + ${mod.name}`;
        if (mod.priceCents !== 0 && block.showPrices) {
          lines.push(padLine(modStr, formatMoney(mod.priceCents), w));
        } else {
          for (const ml of wrapText(modStr, w, 6)) {
            lines.push(ml);
          }
        }
      }
    }

    // Special instructions
    if (block.showSpecialInstructions && item.specialInstructions) {
      const instrLines = wrapText(`    "${item.specialInstructions}"`, w, 4);
      for (const il of instrLines) {
        lines.push(il);
      }
    }

    // Discount label
    if (item.discountLabel && block.showPrices) {
      lines.push(`    ${item.discountLabel}`);
    }
  };

  if (block.groupBySeat) {
    const seatMap = new Map<number | null, ReceiptItem[]>();
    for (const item of block.items) {
      const seat = item.seatNumber;
      if (!seatMap.has(seat)) seatMap.set(seat, []);
      seatMap.get(seat)!.push(item);
    }
    for (const [seat, seatItems] of seatMap) {
      if (seat != null) {
        lines.push('');
        lines.push(padLine(`── Seat ${seat} ──`, '', w));
      }
      for (const item of seatItems) renderItem(item);
    }
  } else {
    for (const item of block.items) renderItem(item);
  }

  lines.push('');
  return lines;
}

function renderTotals(block: TotalsBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push(separator(w, 'thin'));

  lines.push(padLine('Subtotal', formatMoney(block.subtotalCents), w));

  for (const disc of block.discounts) {
    lines.push(padLine(disc.label, `-${formatMoney(disc.amountCents)}`, w));
  }

  for (const charge of block.charges) {
    lines.push(padLine(charge.label, formatMoney(charge.amountCents), w));
  }

  if (block.taxBreakdown && block.taxBreakdown.length > 0) {
    for (const tax of block.taxBreakdown) {
      lines.push(padLine(`  ${tax.name} (${tax.rate})`, formatMoney(tax.amountCents), w));
    }
  } else if (block.taxCents > 0) {
    lines.push(padLine('Tax', formatMoney(block.taxCents), w));
  }

  lines.push(separator(w, 'thick'));
  lines.push(padLine('TOTAL', formatMoneyWithSign(block.totalCents), w));
  lines.push(separator(w, 'thick'));

  return lines;
}

function renderPayment(block: PaymentBlock, w: number): string[] {
  if (block.tenders.length === 0) return [];

  const lines: string[] = [];
  lines.push('');

  for (const tender of block.tenders) {
    let label = tender.label;
    if (tender.cardBrand && tender.cardLast4) {
      label = `${tender.cardBrand} ****${tender.cardLast4}`;
    } else if (tender.cardLast4) {
      label = `CARD ****${tender.cardLast4}`;
    }
    lines.push(padLine(label, formatMoney(tender.amountCents), w));

    if (tender.authCode) {
      lines.push(padLine('  Auth:', tender.authCode, w));
    }
    if (tender.surchargeAmountCents > 0) {
      lines.push(padLine('  Surcharge', formatMoney(tender.surchargeAmountCents), w));
    }
    if (tender.tipCents > 0) {
      lines.push(padLine('  Tip', formatMoney(tender.tipCents), w));
    }
  }

  if (block.changeCents > 0) {
    lines.push(padLine('Change', formatMoney(block.changeCents), w));
  }

  if (block.totalTipCents > 0 && block.tenders.length > 1) {
    lines.push('');
    lines.push(padLine('Total Tips', formatMoney(block.totalTipCents), w));
  }

  lines.push(separator(w, 'thin'));
  return lines;
}

function renderFooter(block: FooterBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push('');

  if (block.giftMessage) {
    lines.push('');
    for (const gml of wrapText(block.giftMessage, w)) {
      lines.push(centerLine(gml, w));
    }
    lines.push('');
  }

  if (block.showReturnPolicy && block.returnPolicyText) {
    lines.push(separator(w, 'thin'));
    for (const rl of wrapText(block.returnPolicyText, w)) {
      lines.push(rl);
    }
    lines.push(separator(w, 'thin'));
  }

  for (const custom of block.customLines) {
    lines.push(centerLine(custom, w));
  }

  lines.push(centerLine(block.thankYouMessage, w));
  lines.push('');
  return lines;
}

function renderQrCode(block: QrCodeBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(centerLine('[ QR CODE ]', w));
  lines.push(centerLine(block.label, w));
  lines.push('');
  return lines;
}

function renderLoyalty(block: LoyaltyBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(separator(w, 'thin'));
  if (block.memberName) {
    lines.push(padLine('Member:', block.memberName, w));
  }
  if (block.memberNumber) {
    lines.push(padLine('Member #:', block.memberNumber, w));
  }
  if (block.pointsEarned > 0) {
    lines.push(padLine('Points Earned:', String(block.pointsEarned), w));
  }
  if (block.pointsBalance > 0) {
    lines.push(padLine('Points Balance:', String(block.pointsBalance), w));
  }
  lines.push(separator(w, 'thin'));
  return lines;
}

function renderSignature(block: SignatureBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push('');

  if (block.showTipLine) {
    lines.push(padLine('Tip:', separator(Math.floor(w * 0.6), 'thin'), w));
    lines.push('');
    lines.push(padLine('Total:', separator(Math.floor(w * 0.6), 'thin'), w));
  }

  if (block.showSignatureLine) {
    lines.push('');
    lines.push('');
    lines.push('x' + separator(w - 1, 'thin'));
    lines.push(centerLine('Signature', w));
  }

  lines.push('');
  return lines;
}

function renderWatermark(block: WatermarkBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(centerLine(`*** ${block.text} ***`, w));
  lines.push('');
  return lines;
}

function renderRefundInfo(block: RefundInfoBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(padLine('Original Order:', block.originalOrderNumber, w));
  lines.push(padLine('Refund Amount:', formatMoneyWithSign(block.refundAmountCents), w));
  lines.push(padLine('Refund Method:', block.refundMethod, w));
  lines.push('');
  return lines;
}

function renderVoidInfo(block: VoidInfoBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(centerLine('*** VOIDED ***', w));
  lines.push(padLine('Voided:', formatReceiptDate(block.voidedAt), w));
  if (block.voidReason) lines.push(padLine('Reason:', block.voidReason, w));
  if (block.voidedBy) lines.push(padLine('By:', block.voidedBy, w));
  lines.push('');
  return lines;
}

function renderReprintInfo(block: ReprintInfoBlock, w: number): string[] {
  const lines: string[] = [];
  lines.push(padLine('Original:', formatReceiptDate(block.originalDate), w));
  if (block.reprintReason) {
    lines.push(padLine('Reason:', block.reprintReason, w));
  }
  return lines;
}

// ── Block dispatch ───────────────────────────────────────────────

function renderBlock(block: ReceiptBlock, w: number): string[] {
  switch (block.type) {
    case 'header': return renderHeader(block, w);
    case 'order_info': return renderOrderInfo(block, w);
    case 'items': return renderItems(block, w);
    case 'totals': return renderTotals(block, w);
    case 'payment': return renderPayment(block, w);
    case 'footer': return renderFooter(block, w);
    case 'qr_code': return renderQrCode(block, w);
    case 'loyalty': return renderLoyalty(block, w);
    case 'signature': return renderSignature(block, w);
    case 'watermark': return renderWatermark(block, w);
    case 'refund_info': return renderRefundInfo(block, w);
    case 'void_info': return renderVoidInfo(block, w);
    case 'reprint_info': return renderReprintInfo(block, w);
  }
}

// ── Public API ───────────────────────────────────────────────────

export function renderThermalReceipt(doc: ReceiptDocument): string[] {
  const w = CHARS_PER_LINE[doc.metadata.printerWidth];
  const lines: string[] = [];

  for (const block of doc.blocks) {
    lines.push(...renderBlock(block, w));
  }

  return lines;
}
