'use client';

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { Order } from '@/types/pos';

// ── Types ───────────────────────────────────────────────────────

interface TenderRow {
  id: string;
  tenderType: string;
  tenderSequence: number;
  amount: number;
  tipAmount: number;
  changeGiven: number;
  amountGiven: number;
  isReversed: boolean;
}

interface TenderSummaryData {
  totalTendered: number;
  totalTips: number;
  totalChangeGiven: number;
  remainingBalance: number;
  isFullyPaid: boolean;
}

interface TenderResponse {
  tenders: TenderRow[];
  summary: TenderSummaryData;
}

// ── Helpers ─────────────────────────────────────────────────────

function fmt(cents: number): string {
  return (cents / 100).toFixed(2);
}

function pad(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length;
  return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right;
}

function center(text: string, width: number): string {
  const gap = width - text.length;
  if (gap <= 0) return text;
  const left = Math.floor(gap / 2);
  return ' '.repeat(left) + text;
}

function dashes(width: number): string {
  return '-'.repeat(width);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const TENDER_LABELS: Record<string, string> = {
  cash: 'CASH',
  card: 'CARD',
  gift_card: 'GIFT CARD',
  store_credit: 'STORE CREDIT',
  house_account: 'HOUSE ACCT',
};

const W = 42; // characters per line for 80mm at ~7pt mono

// ── Receipt Content Builder ────────────────────────────────────

function buildReceiptLines(
  order: Order,
  businessName: string,
  locationName: string,
  tenderData: TenderResponse | null,
): string[] {
  const lines: string[] = [];
  const add = (s: string) => lines.push(s);

  // Header
  add(center(businessName.toUpperCase(), W));
  add(center(locationName, W));
  add('');
  add(dashes(W));
  add(pad(`Order: ${order.orderNumber}`, order.status.toUpperCase(), W));
  add(pad('Date:', formatDate(order.createdAt), W));
  if (order.terminalId) add(pad('Terminal:', order.terminalId, W));
  add(dashes(W));
  add('');

  // Line items
  const orderLines = (order.lines || []).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const line of orderLines) {
    // Item name
    add(line.catalogItemName);

    // Qty x price = total
    const qtyStr = `  ${line.qty} x ${fmt(line.unitPrice)}`;
    const totalStr = fmt(line.lineTotal);
    add(pad(qtyStr, totalStr, W));

    // Modifiers
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

    // Special instructions
    if (line.specialInstructions) {
      add(`    "${line.specialInstructions}"`);
    }
  }

  add('');
  add(dashes(W));

  // Subtotal
  add(pad('Subtotal', fmt(order.subtotal), W));

  // Service charges
  const charges = order.charges || [];
  for (const charge of charges) {
    const label = charge.calculationType === 'percentage'
      ? `${charge.name} (${charge.value}%)`
      : charge.name;
    add(pad(label, fmt(charge.amount), W));
  }

  // Discounts
  const discounts = order.discounts || [];
  for (const disc of discounts) {
    const label = disc.type === 'percentage'
      ? `Discount (${disc.value}%)`
      : 'Discount';
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
  if (tenderData && tenderData.tenders.length > 0) {
    add('');
    for (const tender of tenderData.tenders) {
      if (tender.isReversed) continue;
      const label = TENDER_LABELS[tender.tenderType] ?? tender.tenderType.toUpperCase();
      add(pad(label, fmt(tender.amount), W));
      if (tender.tipAmount > 0) {
        add(pad('  Tip', fmt(tender.tipAmount), W));
      }
      if (tender.changeGiven > 0) {
        add(pad('  Change', fmt(tender.changeGiven), W));
      }
    }

    if (tenderData.summary.totalTips > 0) {
      add('');
      add(pad('Total Tips', fmt(tenderData.summary.totalTips), W));
    }

    add(dashes(W));
  }

  // Footer
  add('');
  add(center('Thank you for your visit!', W));
  add('');

  return lines;
}

// ── Receipt Preview (the actual 80mm-width receipt) ────────────

function ReceiptPreview({
  receiptLines,
  receiptRef,
}: {
  receiptLines: string[];
  receiptRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={receiptRef}
      className="receipt-preview"
      style={{
        width: '80mm',
        margin: '0 auto',
        padding: '4mm 4mm',
        backgroundColor: '#fff',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '11px',
        lineHeight: '1.4',
        color: '#000',
        whiteSpace: 'pre',
        overflowX: 'hidden',
      }}
    >
      {receiptLines.map((line, i) => (
        <div key={i}>{line || '\u00A0'}</div>
      ))}
    </div>
  );
}

// ── Print Styles ────────────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  /* Hide everything except the receipt */
  body > *:not(#receipt-print-root) {
    display: none !important;
  }
  #receipt-print-root {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 80mm !important;
    margin: 0 !important;
    padding: 0 !important;
    z-index: 999999 !important;
  }
  #receipt-print-root .receipt-preview {
    width: 80mm !important;
    margin: 0 !important;
    padding: 2mm 4mm !important;
    font-size: 11px !important;
    line-height: 1.3 !important;
  }
  #receipt-print-root .no-print {
    display: none !important;
  }
  @page {
    size: 80mm auto;
    margin: 0;
  }
}
`;

// ── Main Component ──────────────────────────────────────────────

interface ReceiptViewProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  businessName: string;
  locationName: string;
  locationId: string;
}

export function ReceiptView({
  open,
  onClose,
  order,
  businessName,
  locationName,
  locationId,
}: ReceiptViewProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [tenderData, setTenderData] = useState<TenderResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setTenderData(null);
      return;
    }

    setIsLoading(true);
    apiFetch<{ data: TenderResponse }>(
      `/api/v1/orders/${order.id}/tenders?orderTotal=${order.total}`,
      { headers: { 'X-Location-Id': locationId } },
    )
      .then((res) => setTenderData(res.data))
      .catch(() => {
        // No tenders — that's fine
      })
      .finally(() => setIsLoading(false));
  }, [open, order.id, order.total, locationId]);

  const handlePrint = () => {
    window.print();
  };

  if (!open || typeof document === 'undefined') return null;

  const receiptLines = buildReceiptLines(order, businessName, locationName, tenderData);

  return createPortal(
    <>
      <style>{PRINT_STYLES}</style>
      {/* Screen modal (hidden on print) */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 no-print">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl bg-muted shadow-xl">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 rounded-t-2xl">
            <h2 className="text-sm font-semibold text-foreground">Receipt Preview</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Receipt scroll area */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-gray-600" />
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface shadow-sm">
                <ReceiptPreview receiptLines={receiptLines} receiptRef={receiptRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print-only receipt (rendered outside the modal, visible only to printer) */}
      <div id="receipt-print-root" style={{ display: 'none' }} className="print-only">
        <ReceiptPreview receiptLines={receiptLines} receiptRef={null as any} />
      </div>

      <style>{`
        @media print {
          #receipt-print-root { display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </>,
    document.body,
  );
}
