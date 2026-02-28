/**
 * Email Receipt Renderer
 *
 * Renders a ReceiptDocument to inline-CSS HTML suitable for email delivery.
 * - No <style> blocks (stripped by most email clients)
 * - Max-width 480px, centered
 * - QR code via public API endpoint
 * - XSS prevention via escapeHtml() on all dynamic content
 * - Self-contained — no external resources except logo URL and QR service
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

// ── Shared inline styles ─────────────────────────────────────────

const STYLES = {
  container: 'max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;background:#ffffff;',
  section: 'padding:12px 20px;',
  hr: 'border:none;border-top:1px solid #e5e5e5;margin:0;',
  hrThick: 'border:none;border-top:2px solid #333333;margin:0;',
  center: 'text-align:center;',
  row: 'display:flex;justify-content:space-between;padding:2px 0;',
  label: 'color:#666666;font-size:13px;',
  value: 'font-size:13px;font-weight:500;',
  total: 'font-size:18px;font-weight:700;',
  itemName: 'font-size:14px;font-weight:500;margin-top:8px;',
  modifier: 'font-size:12px;color:#666666;padding-left:16px;',
  instructions: 'font-size:12px;color:#888888;font-style:italic;padding-left:16px;',
  badge: 'display:inline-block;background:#ef4444;color:#ffffff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;margin-right:4px;',
  compBadge: 'display:inline-block;background:#f59e0b;color:#ffffff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;margin-right:4px;',
  watermark: 'text-align:center;font-size:16px;font-weight:700;color:#dc2626;letter-spacing:2px;padding:12px 0;',
  footerText: 'text-align:center;font-size:13px;color:#888888;padding:4px 0;',
  seatHeader: 'font-size:13px;font-weight:600;color:#555555;padding:8px 0 4px;border-bottom:1px dashed #e5e5e5;margin-top:8px;',
} as const;

function row(left: string, right: string, extraStyle = ''): string {
  return `<tr><td style="padding:2px 0;font-size:13px;${extraStyle}">${left}</td><td style="padding:2px 0;font-size:13px;text-align:right;${extraStyle}">${right}</td></tr>`;
}

// ── Block renderers ──────────────────────────────────────────────

function renderHeader(block: HeaderBlock): string {
  const parts: string[] = [];
  parts.push(`<div style="${STYLES.section}${STYLES.center}">`);

  if (block.logoUrl) {
    parts.push(`<img src="${escapeHtml(block.logoUrl)}" alt="${escapeHtml(block.businessName)}" style="max-height:48px;max-width:200px;margin:0 auto 8px;" />`);
  }

  parts.push(`<div style="font-size:18px;font-weight:700;letter-spacing:1px;">${escapeHtml(block.businessName.toUpperCase())}</div>`);

  if (block.locationName) {
    parts.push(`<div style="font-size:14px;color:#555555;margin-top:2px;">${escapeHtml(block.locationName)}</div>`);
  }

  for (const addr of block.addressLines) {
    parts.push(`<div style="font-size:13px;color:#666666;">${escapeHtml(addr)}</div>`);
  }

  if (block.phone) {
    parts.push(`<div style="font-size:13px;color:#666666;">${escapeHtml(block.phone)}</div>`);
  }

  if (block.taxId) {
    parts.push(`<div style="font-size:12px;color:#999999;margin-top:4px;">Tax ID: ${escapeHtml(block.taxId)}</div>`);
  }

  for (const custom of block.customLines) {
    parts.push(`<div style="font-size:13px;color:#666666;">${escapeHtml(custom)}</div>`);
  }

  parts.push('</div>');
  return parts.join('');
}

function renderOrderInfo(block: OrderInfoBlock): string {
  const parts: string[] = [];
  parts.push(`<hr style="${STYLES.hr}" />`);
  parts.push(`<div style="${STYLES.section}"><table style="width:100%;border-collapse:collapse;">`);

  const typePart = block.orderType ? ` &middot; ${escapeHtml(block.orderType)}` : '';
  parts.push(row(`<strong>Order ${escapeHtml(block.orderNumber)}</strong>${typePart}`, '', 'font-size:14px;'));
  parts.push(row('Date', escapeHtml(formatReceiptDate(block.orderDate))));
  if (block.serverName) parts.push(row('Server', escapeHtml(block.serverName)));
  if (block.terminalId) parts.push(row('Terminal', escapeHtml(block.terminalId)));
  if (block.tableNumber) parts.push(row('Table', escapeHtml(block.tableNumber)));
  if (block.checkNumber) parts.push(row('Check', escapeHtml(block.checkNumber)));
  if (block.guestCount != null && block.guestCount > 0) {
    parts.push(row('Guests', String(block.guestCount)));
  }

  parts.push('</table></div>');
  parts.push(`<hr style="${STYLES.hr}" />`);
  return parts.join('');
}

function renderItem(item: ReceiptItem, showPrices: boolean, showModifiers: boolean, showInstructions: boolean): string {
  const parts: string[] = [];

  // Item name with markers
  let nameHtml = '';
  if (item.isVoided) nameHtml += `<span style="${STYLES.badge}">VOID</span>`;
  else if (item.isComped) nameHtml += `<span style="${STYLES.compBadge}">COMP</span>`;
  nameHtml += escapeHtml(item.name);

  parts.push(`<div style="${STYLES.itemName}">${nameHtml}</div>`);

  // Qty x price
  if (showPrices) {
    parts.push(`<table style="width:100%;border-collapse:collapse;"><tr>`);
    parts.push(`<td style="font-size:12px;color:#666666;padding:1px 0;">&nbsp;&nbsp;${item.qty} x ${formatMoney(item.unitPriceCents)}</td>`);
    parts.push(`<td style="font-size:13px;text-align:right;padding:1px 0;font-weight:500;">${formatMoney(item.lineTotalCents)}</td>`);
    parts.push('</tr></table>');
  } else {
    parts.push(`<div style="font-size:12px;color:#666666;">&nbsp;&nbsp;Qty: ${item.qty}</div>`);
  }

  // Modifiers
  if (showModifiers && item.modifiers.length > 0) {
    for (const mod of item.modifiers) {
      if (mod.priceCents !== 0 && showPrices) {
        parts.push(`<table style="width:100%;border-collapse:collapse;"><tr>`);
        parts.push(`<td style="${STYLES.modifier}">+ ${escapeHtml(mod.name)}</td>`);
        parts.push(`<td style="font-size:12px;text-align:right;color:#666666;">${formatMoney(mod.priceCents)}</td>`);
        parts.push('</tr></table>');
      } else {
        parts.push(`<div style="${STYLES.modifier}">+ ${escapeHtml(mod.name)}</div>`);
      }
    }
  }

  // Special instructions
  if (showInstructions && item.specialInstructions) {
    parts.push(`<div style="${STYLES.instructions}">&ldquo;${escapeHtml(item.specialInstructions)}&rdquo;</div>`);
  }

  // Discount label
  if (item.discountLabel && showPrices) {
    parts.push(`<div style="font-size:12px;color:#16a34a;padding-left:16px;">${escapeHtml(item.discountLabel)}</div>`);
  }

  return parts.join('');
}

function renderItems(block: ItemsBlock): string {
  const parts: string[] = [];
  parts.push(`<div style="${STYLES.section}">`);

  if (block.groupBySeat) {
    const seatMap = new Map<number | null, ReceiptItem[]>();
    for (const item of block.items) {
      const seat = item.seatNumber;
      if (!seatMap.has(seat)) seatMap.set(seat, []);
      seatMap.get(seat)!.push(item);
    }
    for (const [seat, seatItems] of seatMap) {
      if (seat != null) {
        parts.push(`<div style="${STYLES.seatHeader}">Seat ${seat}</div>`);
      }
      for (const item of seatItems) {
        parts.push(renderItem(item, block.showPrices, block.showModifiers, block.showSpecialInstructions));
      }
    }
  } else {
    for (const item of block.items) {
      parts.push(renderItem(item, block.showPrices, block.showModifiers, block.showSpecialInstructions));
    }
  }

  parts.push('</div>');
  return parts.join('');
}

function renderTotals(block: TotalsBlock): string {
  const parts: string[] = [];
  parts.push(`<hr style="${STYLES.hr}" />`);
  parts.push(`<div style="${STYLES.section}"><table style="width:100%;border-collapse:collapse;">`);

  parts.push(row('Subtotal', formatMoney(block.subtotalCents)));

  for (const disc of block.discounts) {
    parts.push(row(escapeHtml(disc.label), `-${formatMoney(disc.amountCents)}`, 'color:#16a34a;'));
  }

  for (const charge of block.charges) {
    parts.push(row(escapeHtml(charge.label), formatMoney(charge.amountCents)));
  }

  if (block.taxBreakdown && block.taxBreakdown.length > 0) {
    for (const tax of block.taxBreakdown) {
      parts.push(row(`&nbsp;&nbsp;${escapeHtml(tax.name)} (${escapeHtml(tax.rate)})`, formatMoney(tax.amountCents), 'color:#666666;'));
    }
  } else if (block.taxCents > 0) {
    parts.push(row('Tax', formatMoney(block.taxCents)));
  }

  parts.push('</table></div>');

  // Grand total
  parts.push(`<hr style="${STYLES.hrThick}" />`);
  parts.push(`<div style="${STYLES.section}"><table style="width:100%;border-collapse:collapse;">`);
  parts.push(`<tr><td style="${STYLES.total}">TOTAL</td><td style="${STYLES.total}text-align:right;">${formatMoneyWithSign(block.totalCents)}</td></tr>`);
  parts.push('</table></div>');
  parts.push(`<hr style="${STYLES.hrThick}" />`);

  return parts.join('');
}

function renderPayment(block: PaymentBlock): string {
  if (block.tenders.length === 0) return '';

  const parts: string[] = [];
  parts.push(`<div style="${STYLES.section}"><table style="width:100%;border-collapse:collapse;">`);

  for (const tender of block.tenders) {
    let label = escapeHtml(tender.label);
    if (tender.cardBrand && tender.cardLast4) {
      label = `${escapeHtml(tender.cardBrand)} ****${escapeHtml(tender.cardLast4)}`;
    } else if (tender.cardLast4) {
      label = `CARD ****${escapeHtml(tender.cardLast4)}`;
    }
    parts.push(row(`<strong>${label}</strong>`, formatMoney(tender.amountCents), 'font-size:14px;'));

    if (tender.authCode) {
      parts.push(row('&nbsp;&nbsp;Auth', escapeHtml(tender.authCode), 'color:#666666;font-size:12px;'));
    }
    if (tender.surchargeAmountCents > 0) {
      parts.push(row('&nbsp;&nbsp;Surcharge', formatMoney(tender.surchargeAmountCents), 'color:#666666;font-size:12px;'));
    }
    if (tender.tipCents > 0) {
      parts.push(row('&nbsp;&nbsp;Tip', formatMoney(tender.tipCents), 'color:#666666;font-size:12px;'));
    }
  }

  if (block.changeCents > 0) {
    parts.push(row('Change', formatMoney(block.changeCents)));
  }

  if (block.totalTipCents > 0 && block.tenders.length > 1) {
    parts.push(row('<strong>Total Tips</strong>', formatMoney(block.totalTipCents), 'padding-top:8px;'));
  }

  parts.push('</table></div>');
  parts.push(`<hr style="${STYLES.hr}" />`);
  return parts.join('');
}

function renderFooter(block: FooterBlock): string {
  const parts: string[] = [];
  parts.push(`<div style="${STYLES.section}">`);

  if (block.giftMessage) {
    parts.push(`<div style="text-align:center;font-style:italic;color:#555555;padding:8px 0;border:1px dashed #ddd;border-radius:4px;margin-bottom:8px;">${escapeHtml(block.giftMessage)}</div>`);
  }

  if (block.showReturnPolicy && block.returnPolicyText) {
    parts.push(`<hr style="${STYLES.hr}" />`);
    parts.push(`<div style="font-size:11px;color:#999999;padding:8px 0;">${escapeHtml(block.returnPolicyText)}</div>`);
    parts.push(`<hr style="${STYLES.hr}" />`);
  }

  for (const custom of block.customLines) {
    parts.push(`<div style="${STYLES.footerText}">${escapeHtml(custom)}</div>`);
  }

  parts.push(`<div style="text-align:center;font-size:14px;color:#555555;padding:8px 0;font-weight:500;">${escapeHtml(block.thankYouMessage)}</div>`);
  parts.push('</div>');
  return parts.join('');
}

function renderQrCode(block: QrCodeBlock): string {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(block.url)}&size=150x150`;
  return `<div style="${STYLES.section}${STYLES.center}">
    <img src="${escapeHtml(qrUrl)}" alt="QR Code" width="150" height="150" style="margin:0 auto;display:block;" />
    <div style="font-size:13px;color:#666666;margin-top:6px;">${escapeHtml(block.label)}</div>
  </div>`;
}

function renderLoyalty(block: LoyaltyBlock): string {
  const parts: string[] = [];
  parts.push(`<hr style="${STYLES.hr}" />`);
  parts.push(`<div style="${STYLES.section};background:#f9f9f9;border-radius:4px;"><table style="width:100%;border-collapse:collapse;">`);

  if (block.memberName) parts.push(row('Member', escapeHtml(block.memberName)));
  if (block.memberNumber) parts.push(row('Member #', escapeHtml(block.memberNumber)));
  if (block.pointsEarned > 0) parts.push(row('Points Earned', `+${block.pointsEarned}`, 'color:#16a34a;'));
  if (block.pointsBalance > 0) parts.push(row('Points Balance', String(block.pointsBalance)));

  parts.push('</table></div>');
  parts.push(`<hr style="${STYLES.hr}" />`);
  return parts.join('');
}

function renderSignature(_block: SignatureBlock): string {
  // Email receipts don't include signature lines — skip
  return '';
}

function renderWatermark(block: WatermarkBlock): string {
  return `<div style="${STYLES.watermark}">*** ${escapeHtml(block.text)} ***</div>`;
}

function renderRefundInfo(block: RefundInfoBlock): string {
  const parts: string[] = [];
  parts.push(`<div style="${STYLES.section};background:#fef2f2;border-radius:4px;"><table style="width:100%;border-collapse:collapse;">`);
  parts.push(row('Original Order', escapeHtml(block.originalOrderNumber)));
  parts.push(row('Refund Amount', formatMoneyWithSign(block.refundAmountCents), 'color:#dc2626;font-weight:600;'));
  parts.push(row('Refund Method', escapeHtml(block.refundMethod)));
  parts.push('</table></div>');
  return parts.join('');
}

function renderVoidInfo(block: VoidInfoBlock): string {
  const parts: string[] = [];
  parts.push(`<div style="${STYLES.section};background:#fef2f2;border-radius:4px;${STYLES.center}">`);
  parts.push(`<div style="font-size:16px;font-weight:700;color:#dc2626;">*** VOIDED ***</div>`);
  parts.push(`<table style="width:100%;border-collapse:collapse;margin-top:8px;">`);
  parts.push(row('Voided', escapeHtml(formatReceiptDate(block.voidedAt))));
  if (block.voidReason) parts.push(row('Reason', escapeHtml(block.voidReason)));
  if (block.voidedBy) parts.push(row('By', escapeHtml(block.voidedBy)));
  parts.push('</table></div>');
  return parts.join('');
}

function renderReprintInfo(block: ReprintInfoBlock): string {
  const parts: string[] = [];
  parts.push(`<div style="${STYLES.section}"><table style="width:100%;border-collapse:collapse;">`);
  parts.push(row('Original Date', escapeHtml(formatReceiptDate(block.originalDate))));
  if (block.reprintReason) parts.push(row('Reason', escapeHtml(block.reprintReason)));
  parts.push('</table></div>');
  return parts.join('');
}

// ── Block dispatch ───────────────────────────────────────────────

function renderBlock(block: ReceiptBlock): string {
  switch (block.type) {
    case 'header': return renderHeader(block);
    case 'order_info': return renderOrderInfo(block);
    case 'items': return renderItems(block);
    case 'totals': return renderTotals(block);
    case 'payment': return renderPayment(block);
    case 'footer': return renderFooter(block);
    case 'qr_code': return renderQrCode(block);
    case 'loyalty': return renderLoyalty(block);
    case 'signature': return renderSignature(block);
    case 'watermark': return renderWatermark(block);
    case 'refund_info': return renderRefundInfo(block);
    case 'void_info': return renderVoidInfo(block);
    case 'reprint_info': return renderReprintInfo(block);
  }
}

// ── Public API ───────────────────────────────────────────────────

export function renderEmailReceipt(doc: ReceiptDocument): string {
  const body = doc.blocks.map((block) => renderBlock(block)).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt</title>
</head>
<body style="margin:0;padding:20px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="${STYLES.container}border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
${body}
</div>
</body>
</html>`;
}
