/**
 * POS Receipt Printer Utility
 *
 * @deprecated Use `receipt-printer.ts` and the receipt engine in `@oppsera/shared/receipt-engine` instead.
 * This file is preserved for backward compatibility. All exports are deprecated.
 *
 * Prints receipts to thermal printers (80mm) with cascading fallbacks:
 *   1. 80mm thermal printer (matched by name heuristics)
 *   2. System default printer
 *   3. Any available printer
 *   4. Save as PDF (browser print dialog)
 *
 * Uses a hidden iframe so the main POS UI is never disrupted.
 */

// ── Receipt data types ────────────────────────────────────────────

/** @deprecated Use `LegacyOrderForReceipt` from `@oppsera/shared` and `buildReceiptDocument()` instead. */
export interface OrderForReceipt {
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

/** @deprecated Use `LegacyTenderForReceipt` from `@oppsera/shared` and `buildReceiptDocument()` instead. */
export interface TenderForReceipt {
  tenderType: string;
  amount: number;
  tipAmount: number;
  changeGiven: number;
  isReversed: boolean;
}

// ── Constants ─────────────────────────────────────────────────────

const W = 42; // characters per line for 80mm at ~7pt mono

const TENDER_LABELS: Record<string, string> = {
  cash: 'CASH',
  card: 'CARD',
  gift_card: 'GIFT CARD',
  store_credit: 'STORE CREDIT',
  house_account: 'HOUSE ACCT',
  check: 'CHECK',
};

// ── Text helpers ──────────────────────────────────────────────────

function fmt(cents: number): string {
  return (cents / 100).toFixed(2);
}

function pad(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length;
  return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right;
}

function centerText(text: string, width: number): string {
  const gap = width - text.length;
  if (gap <= 0) return text;
  return ' '.repeat(Math.floor(gap / 2)) + text;
}

function dashes(width: number): string {
  return '-'.repeat(width);
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

// ── Receipt line builder ──────────────────────────────────────────

/**
 * @deprecated Use `buildReceiptDocument()` from `@oppsera/shared` + `renderThermalReceipt()` instead.
 *
 * Build raw text lines for an 80mm receipt from order + tender data.
 */
export function buildReceiptLines(
  order: OrderForReceipt,
  businessName: string,
  locationName: string,
  tenders?: TenderForReceipt[],
): string[] {
  const raw: string[] = [];
  const add = (s: string) => raw.push(s);

  // Header
  add(centerText(businessName.toUpperCase(), W));
  add(centerText(locationName, W));
  add('');
  add(dashes(W));
  add(pad(`Order: ${order.orderNumber}`, order.status.toUpperCase(), W));
  add(pad('Date:', formatReceiptDate(order.createdAt), W));
  if (order.terminalId) add(pad('Terminal:', order.terminalId, W));
  add(dashes(W));
  add('');

  // Line items
  const orderLines = [...(order.lines || [])].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const line of orderLines) {
    add(line.catalogItemName);
    const qtyStr = `  ${line.qty} x ${fmt(line.unitPrice)}`;
    add(pad(qtyStr, fmt(line.lineTotal), W));

    if (line.modifiers && line.modifiers.length > 0) {
      for (const mod of line.modifiers) {
        const modStr = `    + ${mod.name}`;
        if (mod.priceAdjustment !== 0) {
          add(pad(modStr, fmt(mod.priceAdjustment), W));
        } else {
          add(modStr);
        }
      }
    }

    if (line.specialInstructions) {
      add(`    "${line.specialInstructions}"`);
    }
  }

  add('');
  add(dashes(W));

  // Subtotal
  add(pad('Subtotal', fmt(order.subtotal), W));

  // Service charges
  for (const charge of order.charges || []) {
    const label =
      charge.calculationType === 'percentage'
        ? `${charge.name} (${charge.value}%)`
        : charge.name;
    add(pad(label, fmt(charge.amount), W));
  }

  // Discounts
  for (const disc of order.discounts || []) {
    const label = disc.type === 'percentage' ? `Discount (${disc.value}%)` : 'Discount';
    add(pad(label, `-${fmt(disc.amount)}`, W));
  }

  // Tax
  if (order.taxTotal > 0) {
    add(pad('Tax', fmt(order.taxTotal), W));
  }

  add(dashes(W));
  add(pad('TOTAL', `$${fmt(order.total)}`, W));
  add(dashes(W));

  // Tenders
  const activeTenders = (tenders || []).filter((t) => !t.isReversed);
  if (activeTenders.length > 0) {
    add('');
    let totalTips = 0;
    for (const tender of activeTenders) {
      const label = TENDER_LABELS[tender.tenderType] ?? tender.tenderType.toUpperCase();
      add(pad(label, fmt(tender.amount), W));
      if (tender.tipAmount > 0) {
        add(pad('  Tip', fmt(tender.tipAmount), W));
        totalTips += tender.tipAmount;
      }
      if (tender.changeGiven > 0) {
        add(pad('  Change', fmt(tender.changeGiven), W));
      }
    }
    if (totalTips > 0) {
      add('');
      add(pad('Total Tips', fmt(totalTips), W));
    }
    add(dashes(W));
  }

  // Footer
  add('');
  add(centerText('Thank you for your visit!', W));
  add('');

  return raw;
}

// ── HTML builder ──────────────────────────────────────────────────

function buildReceiptHtml(rawLines: string[]): string {
  const body = rawLines.map((line) => `<div>${line || '&nbsp;'}</div>`).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    line-height: 1.35;
    color: #000;
    background: #fff;
    padding: 2mm 3mm;
    white-space: pre;
    overflow-x: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ── Print via hidden iframe ───────────────────────────────────────

/**
 * @deprecated Use `printReceiptDocument()` from `receipt-printer.ts` instead.
 *
 * Prints receipt HTML using a hidden iframe so the main POS page is untouched.
 * The browser print dialog handles printer selection with this priority:
 *   - 80mm thermal printers automatically use the 80mm @page size
 *   - System default printer works fine (receipt renders at 80mm column)
 *   - "Save as PDF" is always available as a last resort
 */
export function printReceipt(rawLines: string[]): Promise<void> {
  const html = buildReceiptHtml(rawLines);

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:80mm;height:0;border:none;visibility:hidden;';
    iframe.setAttribute('aria-hidden', 'true');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        document.body.removeChild(iframe);
      } catch {
        /* already removed */
      }
      resolve();
    };

    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
          cleanup();
          return;
        }

        doc.open();
        doc.write(html);
        doc.close();

        // Small delay to let content render before triggering print
        setTimeout(() => {
          try {
            const win = iframe.contentWindow;
            if (!win) {
              cleanup();
              return;
            }

            win.onafterprint = cleanup;
            win.print();

            // Safety timeout — some browsers never fire onafterprint
            setTimeout(cleanup, 60_000);
          } catch {
            cleanup();
          }
        }, 150);
      } catch {
        cleanup();
      }
    };

    iframe.onerror = cleanup;
    document.body.appendChild(iframe);
  });
}

// ── Convenience: build + print in one call ────────────────────────

/**
 * @deprecated Use `printReceiptDocument()` from `receipt-printer.ts` with `orderForReceiptToInput()` adapter instead.
 *
 * Build receipt lines from order data and print immediately.
 */
export async function printOrderReceipt(
  order: OrderForReceipt,
  businessName: string,
  locationName: string,
  tenders?: TenderForReceipt[],
): Promise<void> {
  const lines = buildReceiptLines(order, businessName, locationName, tenders);
  await printReceipt(lines);
}
