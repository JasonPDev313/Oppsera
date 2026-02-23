/**
 * Pure text-based chit/receipt layout renderers.
 * All output is plain text for thermal printers (40 char width).
 * No side effects — these functions only produce formatted strings.
 */

const LINE_WIDTH = 40;
const SEPARATOR = '─'.repeat(LINE_WIDTH);
const DOUBLE_SEP = '═'.repeat(LINE_WIDTH);

/** Pad or truncate a string to fit within the line width */
export function fitLine(text: string, width: number = LINE_WIDTH): string {
  if (text.length > width) return text.slice(0, width);
  return text;
}

/** Right-align a value on a line */
export function rightAlign(label: string, value: string, width: number = LINE_WIDTH): string {
  const gap = width - label.length - value.length;
  if (gap < 1) return fitLine(`${label} ${value}`, width);
  return `${label}${' '.repeat(gap)}${value}`;
}

/** Center text within the line width */
export function centerText(text: string, width: number = LINE_WIDTH): string {
  if (text.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

/** Format cents as dollar string */
export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Kitchen Chit ─────────────────────────────────────────────────

export interface KitchenChitData {
  ticketNumber: number;
  time: string;
  courseName: string | null;
  tableNumber: string;
  serverName: string;
  partySize: number | null;
  items: KitchenChitItem[];
  rushFlag: boolean;
  vipFlag: boolean;
}

export interface KitchenChitItem {
  qty: number;
  name: string;
  seatNumber: number | null;
  modifiers: string[];
  specialInstructions: string | null;
  allergenFlags: string[];
}

export function renderKitchenChitText(data: KitchenChitData): string {
  const lines: string[] = [];

  lines.push(DOUBLE_SEP);
  lines.push(centerText(`KITCHEN TICKET #${data.ticketNumber}`));
  const timeCourse = data.courseName
    ? `${data.time} | ${data.courseName}`
    : data.time;
  lines.push(centerText(timeCourse));
  lines.push(SEPARATOR);
  lines.push(`TABLE: ${data.tableNumber}  |  SERVER: ${data.serverName}`);
  if (data.partySize != null) {
    lines.push(`PARTY SIZE: ${data.partySize}`);
  }
  lines.push(SEPARATOR);
  lines.push('');

  for (const item of data.items) {
    const seat = item.seatNumber != null ? `  [SEAT ${item.seatNumber}]` : '';
    lines.push(fitLine(`  ${item.qty}x ${item.name}${seat}`));
    for (const mod of item.modifiers) {
      lines.push(fitLine(`     ${mod}`));
    }
    if (item.specialInstructions) {
      lines.push(fitLine(`     ${item.specialInstructions}`));
    }
    for (const flag of item.allergenFlags) {
      lines.push(fitLine(`     ${flag}`));
    }
    lines.push('');
  }

  if (data.rushFlag) lines.push(centerText('>>> RUSH <<<'));
  if (data.vipFlag) lines.push(centerText('>>> VIP <<<'));

  lines.push(SEPARATOR);
  return lines.join('\n');
}

// ── Delta Chit ───────────────────────────────────────────────────

export interface DeltaChitData {
  ticketNumber: number;
  deltaType: 'add' | 'void' | 'rush';
  time: string;
  tableNumber: string;
  serverName: string;
  items: DeltaChitItem[];
}

export interface DeltaChitItem {
  qty: number;
  name: string;
  seatNumber: number | null;
  modifiers: string[];
  specialInstructions: string | null;
  voidReason: string | null;
}

export function renderDeltaChitText(data: DeltaChitData): string {
  const lines: string[] = [];
  const typeLabel = `*** ${data.deltaType.toUpperCase()} ***`;

  lines.push(DOUBLE_SEP);
  lines.push(centerText(`DELTA TICKET #${data.ticketNumber}`));
  lines.push(centerText(typeLabel));
  lines.push(centerText(data.time));
  lines.push(SEPARATOR);
  lines.push(`TABLE: ${data.tableNumber}  |  SERVER: ${data.serverName}`);
  lines.push('');
  lines.push(centerText(typeLabel));

  for (const item of data.items) {
    const seat = item.seatNumber != null ? `  [SEAT ${item.seatNumber}]` : '';
    lines.push(fitLine(`  ${item.qty}x ${item.name}${seat}`));
    for (const mod of item.modifiers) {
      lines.push(fitLine(`     ${mod}`));
    }
    if (item.specialInstructions) {
      lines.push(fitLine(`     ${item.specialInstructions}`));
    }
    if (item.voidReason) {
      lines.push(fitLine(`     REASON: ${item.voidReason}`));
    }
    lines.push('');
  }

  lines.push(SEPARATOR);
  return lines.join('\n');
}

// ── Guest Check ──────────────────────────────────────────────────

export interface GuestCheckData {
  restaurantName: string;
  tagline: string | null;
  date: string;
  time: string;
  serverName: string;
  tableNumber: string;
  items: GuestCheckItem[];
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  totalCents: number;
  footerLines: string[];
  bySeat: boolean;
}

export interface GuestCheckItem {
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  seatNumber: number | null;
}

export function renderGuestCheckText(data: GuestCheckData): string {
  const lines: string[] = [];

  lines.push(centerText(data.restaurantName));
  if (data.tagline) lines.push(centerText(data.tagline));
  lines.push('');
  lines.push(`Date: ${data.date}  Time: ${data.time}`);
  lines.push(`SERVER: ${data.serverName}`);
  lines.push(`TABLE: ${data.tableNumber}`);
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('ITEMS:');
  lines.push('');

  if (data.bySeat) {
    const bySeat = new Map<number, GuestCheckItem[]>();
    for (const item of data.items) {
      const seat = item.seatNumber ?? 0;
      const existing = bySeat.get(seat) ?? [];
      existing.push(item);
      bySeat.set(seat, existing);
    }
    for (const [seat, seatItems] of bySeat) {
      lines.push(`  SEAT ${seat}:`);
      for (const item of seatItems) {
        lines.push(rightAlign(
          `    ${item.name}  ${item.qty} x ${formatDollars(item.unitPriceCents)}`,
          formatDollars(item.lineTotalCents),
        ));
      }
    }
  } else {
    for (const item of data.items) {
      lines.push(rightAlign(
        `  ${item.name}  ${item.qty} x ${formatDollars(item.unitPriceCents)}`,
        formatDollars(item.lineTotalCents),
      ));
    }
  }

  lines.push('');
  lines.push(SEPARATOR);
  lines.push(rightAlign('SUBTOTAL:', formatDollars(data.subtotalCents)));
  lines.push(rightAlign('TAX:', formatDollars(data.taxCents)));
  if (data.serviceChargeCents > 0) {
    lines.push(rightAlign('SERVICE CHARGE:', formatDollars(data.serviceChargeCents)));
  }
  lines.push(rightAlign('TOTAL:', formatDollars(data.totalCents)));
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('TIP LINE: $____________');
  lines.push('TOTAL WITH TIP: $____________');
  lines.push('');

  for (const line of data.footerLines) {
    lines.push(centerText(line));
  }
  lines.push(centerText('THANK YOU!'));

  return lines.join('\n');
}

// ── Guest Check with QR Pay ──────────────────────────────────────

export interface GuestCheckWithQRData extends GuestCheckData {
  guestPayUrl: string | null;
  guestPayShortCode: string | null;
}

/**
 * Renders a guest check with optional QR payment section.
 * When guestPayUrl is present, replaces the tip/total-with-tip lines
 * with a QR code placeholder and pay URL.
 * The `[ QR CODE HERE ]` placeholder is replaced by the actual QR image
 * in the print driver. The print job `metadata.qrUrl` tells the driver
 * what to encode.
 */
export function renderGuestCheckWithQRText(data: GuestCheckWithQRData): string {
  if (!data.guestPayUrl) {
    // Fall through to standard guest check (with tip line)
    return renderGuestCheckText(data);
  }

  const lines: string[] = [];

  // Header
  lines.push(centerText(data.restaurantName));
  if (data.tagline) lines.push(centerText(data.tagline));
  lines.push('');
  lines.push(`Date: ${data.date}  Time: ${data.time}`);
  lines.push(`SERVER: ${data.serverName}`);
  lines.push(`TABLE: ${data.tableNumber}`);
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('ITEMS:');
  lines.push('');

  // Items (same logic as renderGuestCheckText)
  if (data.bySeat) {
    const bySeat = new Map<number, GuestCheckItem[]>();
    for (const item of data.items) {
      const seat = item.seatNumber ?? 0;
      const existing = bySeat.get(seat) ?? [];
      existing.push(item);
      bySeat.set(seat, existing);
    }
    for (const [seat, seatItems] of bySeat) {
      lines.push(`  SEAT ${seat}:`);
      for (const item of seatItems) {
        lines.push(rightAlign(
          `    ${item.name}  ${item.qty} x ${formatDollars(item.unitPriceCents)}`,
          formatDollars(item.lineTotalCents),
        ));
      }
    }
  } else {
    for (const item of data.items) {
      lines.push(rightAlign(
        `  ${item.name}  ${item.qty} x ${formatDollars(item.unitPriceCents)}`,
        formatDollars(item.lineTotalCents),
      ));
    }
  }

  // Totals
  lines.push('');
  lines.push(SEPARATOR);
  lines.push(rightAlign('SUBTOTAL:', formatDollars(data.subtotalCents)));
  lines.push(rightAlign('TAX:', formatDollars(data.taxCents)));
  if (data.serviceChargeCents > 0) {
    lines.push(rightAlign('SERVICE CHARGE:', formatDollars(data.serviceChargeCents)));
  }
  lines.push(rightAlign('TOTAL:', formatDollars(data.totalCents)));
  lines.push('');

  // QR Pay section (replaces tip line)
  lines.push(SEPARATOR);
  lines.push(centerText('SCAN TO PAY & TIP'));
  lines.push('');
  lines.push(centerText('[ QR CODE HERE ]'));
  lines.push('');

  // Short URL for manual entry
  const displayUrl = data.guestPayShortCode
    ? `pay.oppsera.com/g/${data.guestPayShortCode}`
    : data.guestPayUrl;
  lines.push(centerText(displayUrl));
  lines.push('');
  lines.push(centerText('No app needed \u2022 Scan with'));
  lines.push(centerText('your phone camera'));
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(centerText('Prefer cash? Please see your server.'));
  lines.push('');

  // Footer
  for (const line of data.footerLines) {
    lines.push(centerText(line));
  }
  lines.push(centerText('THANK YOU!'));

  return lines.join('\n');
}

// ── Receipt (Post-Payment) ───────────────────────────────────────

export interface ReceiptData extends GuestCheckData {
  paymentMethod: string;
  cardLast4: string | null;
  cardBrand: string | null;
  amountChargedCents: number;
  tipAmountCents: number;
  totalWithTipCents: number;
  transactionReference: string | null;
  copy: 'merchant' | 'customer';
}

export function renderReceiptText(data: ReceiptData): string {
  // Start with guest check portion
  const checkPortion = renderGuestCheckText({
    ...data,
    // Override footer to omit tip line (payment fills it)
    footerLines: [],
  });

  const lines: string[] = [checkPortion];
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('PAYMENT DETAILS:');

  if (data.cardLast4) {
    const brand = data.cardBrand ? `${data.cardBrand} ` : '';
    lines.push(`  CARD: ${brand}ending in ${data.cardLast4}`);
  } else {
    lines.push(`  METHOD: ${data.paymentMethod}`);
  }

  lines.push(`  AMOUNT: ${formatDollars(data.amountChargedCents)}`);
  lines.push(`  TIP: ${formatDollars(data.tipAmountCents)}`);
  lines.push(`  TOTAL CHARGED: ${formatDollars(data.totalWithTipCents)}`);

  if (data.transactionReference) {
    lines.push(`  REFERENCE: ${data.transactionReference}`);
  }

  lines.push('');
  lines.push(data.copy === 'merchant' ? 'MERCHANT COPY' : 'CUSTOMER COPY');
  lines.push('');

  for (const line of data.footerLines) {
    lines.push(centerText(line));
  }
  lines.push(centerText('THANK YOU!'));

  return lines.join('\n');
}

// ── Expo Chit ────────────────────────────────────────────────────

export interface ExpoChitData {
  ticketNumber: number;
  tableNumber: string;
  partySize: number | null;
  items: ExpoChitItem[];
  allReady: boolean;
}

export interface ExpoChitItem {
  name: string;
  seatNumber: number | null;
  stationStatuses: { stationName: string; ready: boolean }[];
}

export function renderExpoChitText(data: ExpoChitData): string {
  const lines: string[] = [];

  lines.push(DOUBLE_SEP);
  lines.push(centerText('EXPO / READY FOR PICKUP'));
  lines.push(centerText(`TICKET #${data.ticketNumber}`));
  lines.push(SEPARATOR);

  const partyInfo = data.partySize != null ? `  |  PARTY SIZE: ${data.partySize}` : '';
  lines.push(`TABLE: ${data.tableNumber}${partyInfo}`);
  lines.push('');
  lines.push('ITEMS READY FOR DELIVERY:');
  lines.push('');

  for (const item of data.items) {
    const seat = item.seatNumber != null ? `[SEAT ${item.seatNumber}]` : '';
    const statuses = item.stationStatuses
      .map((s) => `${s.ready ? '✓' : '✗'} ${s.stationName}`)
      .join('  ');
    lines.push(fitLine(`  ${item.name}  ${seat}  ${statuses}`));
  }

  lines.push('');
  if (data.allReady) {
    lines.push(centerText('ALL ITEMS READY - SEND TO SERVICE'));
  }
  lines.push(SEPARATOR);

  return lines.join('\n');
}

// ── Z-Report ─────────────────────────────────────────────────────

export interface ZReportData {
  locationName: string;
  businessDate: string;
  grossSalesCents: number;
  totalDiscountsCents: number;
  totalCompsCents: number;
  netSalesCents: number;
  taxCollectedCents: number;
  cashTotalCents: number;
  cardTotalCents: number;
  giftCardTotalCents: number;
  houseTotalCents: number;
  voidCount: number;
  voidTotalCents: number;
  compCount: number;
  compTotalCents: number;
  discountCount: number;
  discountTotalCents: number;
  serviceChargeTotalCents: number;
  cardTipsTotalCents: number;
  cashTipsTotalCents: number;
  coversCount: number;
  checkCount: number;
  avgCheckAmountCents: number;
  startingFloatCents: number;
  cashSalesCents: number;
  cashTipsCents: number;
  cashDropsCents: number;
  paidOutsCents: number;
  expectedCashCents: number;
  actualCashCountCents: number;
  varianceCents: number;
  timestamp: string;
  closedBy: string;
}

export function renderZReportText(data: ZReportData): string {
  const lines: string[] = [];

  lines.push(DOUBLE_SEP);
  lines.push(centerText('Z-REPORT / CLOSE BATCH'));
  lines.push(centerText(`${data.locationName} | ${data.businessDate}`));
  lines.push(DOUBLE_SEP);
  lines.push('');
  lines.push('SALES SUMMARY:');
  lines.push(rightAlign('  Gross Sales:', formatDollars(data.grossSalesCents)));
  lines.push(rightAlign('  Discounts:', `-${formatDollars(data.totalDiscountsCents)}`));
  lines.push(rightAlign('  Comps:', `-${formatDollars(data.totalCompsCents)}`));
  lines.push(rightAlign('  Net Sales:', formatDollars(data.netSalesCents)));
  lines.push('');
  lines.push(rightAlign('TAX COLLECTED:', formatDollars(data.taxCollectedCents)));
  lines.push('');
  lines.push('PAYMENT BREAKDOWN:');
  lines.push(rightAlign('  Cash:', formatDollars(data.cashTotalCents)));
  lines.push(rightAlign('  Credit Cards:', formatDollars(data.cardTotalCents)));
  lines.push(rightAlign('  Gift Cards:', formatDollars(data.giftCardTotalCents)));
  lines.push(rightAlign('  House Accounts:', formatDollars(data.houseTotalCents)));
  lines.push('');
  lines.push('VOID SUMMARY:');
  lines.push(rightAlign('  Void Count:', String(data.voidCount)));
  lines.push(rightAlign('  Void Amount:', `-${formatDollars(data.voidTotalCents)}`));
  lines.push('');
  lines.push('SERVICE CHARGES:');
  lines.push(rightAlign('  Total:', formatDollars(data.serviceChargeTotalCents)));
  lines.push('');
  lines.push('TIPS COLLECTED:');
  lines.push(rightAlign('  Card Tips:', formatDollars(data.cardTipsTotalCents)));
  lines.push(rightAlign('  Cash Tips Declared:', formatDollars(data.cashTipsTotalCents)));
  lines.push('');
  lines.push('OPERATIONAL METRICS:');
  lines.push(rightAlign('  Total Covers:', String(data.coversCount)));
  lines.push(rightAlign('  Total Checks:', String(data.checkCount)));
  lines.push(rightAlign('  Avg Check Amount:', formatDollars(data.avgCheckAmountCents)));
  lines.push('');
  lines.push('CASH ACCOUNTABILITY:');
  lines.push(rightAlign('  Starting Float:', formatDollars(data.startingFloatCents)));
  lines.push(rightAlign('  Cash Sales:', formatDollars(data.cashSalesCents)));
  lines.push(rightAlign('  + Cash Tips:', formatDollars(data.cashTipsCents)));
  lines.push(rightAlign('  - Cash Drops:', formatDollars(data.cashDropsCents)));
  lines.push(rightAlign('  - Paid Outs:', formatDollars(data.paidOutsCents)));
  lines.push(rightAlign('  = Expected Cash:', formatDollars(data.expectedCashCents)));
  lines.push('');
  lines.push(rightAlign('  Actual Cash Count:', formatDollars(data.actualCashCountCents)));
  const overShort = data.varianceCents >= 0
    ? formatDollars(data.varianceCents)
    : `(${formatDollars(Math.abs(data.varianceCents))})`;
  lines.push(rightAlign('  Over / (Short):', overShort));
  lines.push('');
  lines.push(`TIMESTAMP: ${data.timestamp}`);
  lines.push(`CLOSED BY: ${data.closedBy}`);

  return lines.join('\n');
}
