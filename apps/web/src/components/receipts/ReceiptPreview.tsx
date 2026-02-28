/**
 * ReceiptPreview — Visual receipt preview component
 *
 * Renders a ReceiptDocument as a styled visual receipt.
 * Block-by-block rendering with React sub-components.
 * Dark-mode compliant. font-mono text-sm base.
 */

'use client';

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
} from '@oppsera/shared';

// ── Money formatter ─────────────────────────────────────────────

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Sub-components ──────────────────────────────────────────────

function Separator() {
  return <div className="border-t border-dashed border-border my-2" />;
}

function HeaderPreview({ block }: { block: HeaderBlock }) {
  return (
    <div className="text-center space-y-0.5">
      <p className="font-bold text-base">{block.businessName}</p>
      {block.locationName && (
        <p className="text-xs text-muted-foreground">{block.locationName}</p>
      )}
      {block.addressLines.map((line, i) => (
        <p key={i} className="text-xs text-muted-foreground">{line}</p>
      ))}
      {block.phone && (
        <p className="text-xs text-muted-foreground">{block.phone}</p>
      )}
      {block.taxId && (
        <p className="text-xs text-muted-foreground">Tax ID: {block.taxId}</p>
      )}
      {block.customLines.map((line, i) => (
        <p key={`c-${i}`} className="text-xs text-muted-foreground">{line}</p>
      ))}
    </div>
  );
}

function OrderInfoPreview({ block }: { block: OrderInfoBlock }) {
  return (
    <div className="space-y-0.5 text-xs">
      <div className="flex justify-between">
        <span>Order #{block.orderNumber}</span>
        <span>{block.orderType ?? ''}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>{formatDate(block.orderDate)}</span>
        {block.terminalId && <span>Terminal: {block.terminalId}</span>}
      </div>
      {block.serverName && (
        <p className="text-muted-foreground">Server: {block.serverName}</p>
      )}
      {block.tableNumber && (
        <p className="text-muted-foreground">
          Table: {block.tableNumber}
          {block.guestCount ? ` (${block.guestCount} guests)` : ''}
        </p>
      )}
    </div>
  );
}

function ItemRow({ item, showPrices }: { item: ReceiptItem; showPrices: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className={item.isVoided ? 'line-through text-muted-foreground' : ''}>
            {item.isComped && <span className="text-amber-500 mr-1">[COMP]</span>}
            {item.isVoided && <span className="text-red-500 mr-1">[VOID]</span>}
            {item.qty > 1 ? `${item.qty}x ` : ''}
            {item.name}
          </span>
        </div>
        {showPrices && (
          <span className="shrink-0 tabular-nums">
            {item.isVoided ? (
              <span className="line-through text-muted-foreground">{fmtMoney(item.lineTotalCents)}</span>
            ) : (
              fmtMoney(item.lineTotalCents)
            )}
          </span>
        )}
      </div>
      {/* Modifiers */}
      {item.modifiers.length > 0 && (
        <div className="pl-4 space-y-0.5">
          {item.modifiers.map((mod, i) => (
            <div key={i} className="flex justify-between text-xs text-muted-foreground">
              <span>+ {mod.name}</span>
              {mod.priceCents !== 0 && showPrices && (
                <span className="tabular-nums">{fmtMoney(mod.priceCents)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Special instructions */}
      {item.specialInstructions && (
        <p className="pl-4 text-xs text-muted-foreground italic">
          &ldquo;{item.specialInstructions}&rdquo;
        </p>
      )}
      {/* Discount label */}
      {item.discountLabel && (
        <p className="pl-4 text-xs text-green-500">{item.discountLabel}</p>
      )}
    </div>
  );
}

function ItemsPreview({ block }: { block: ItemsBlock }) {
  if (block.groupBySeat) {
    const bySeat = new Map<number | null, ReceiptItem[]>();
    for (const item of block.items) {
      const seat = item.seatNumber;
      if (!bySeat.has(seat)) bySeat.set(seat, []);
      bySeat.get(seat)!.push(item);
    }

    return (
      <div className="space-y-2">
        {Array.from(bySeat.entries()).map(([seat, items]) => (
          <div key={seat ?? 'none'}>
            {seat != null && (
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Seat {seat}
              </p>
            )}
            <div className="space-y-1">
              {items.map((item, i) => (
                <ItemRow key={i} item={item} showPrices={block.showPrices} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {block.items.map((item, i) => (
        <ItemRow key={i} item={item} showPrices={block.showPrices} />
      ))}
    </div>
  );
}

function TotalsPreview({ block }: { block: TotalsBlock }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span className="tabular-nums">{fmtMoney(block.subtotalCents)}</span>
      </div>
      {block.discounts.map((d, i) => (
        <div key={`d-${i}`} className="flex justify-between text-green-500">
          <span>{d.label}</span>
          <span className="tabular-nums">-{fmtMoney(d.amountCents)}</span>
        </div>
      ))}
      {block.charges.map((c, i) => (
        <div key={`c-${i}`} className="flex justify-between">
          <span>{c.label}</span>
          <span className="tabular-nums">{fmtMoney(c.amountCents)}</span>
        </div>
      ))}
      {block.taxCents > 0 && (
        <>
          <div className="flex justify-between">
            <span>Tax</span>
            <span className="tabular-nums">{fmtMoney(block.taxCents)}</span>
          </div>
          {block.taxBreakdown?.map((tb, i) => (
            <div key={`tb-${i}`} className="flex justify-between text-xs text-muted-foreground pl-2">
              <span>{tb.name} ({tb.rate})</span>
              <span className="tabular-nums">{fmtMoney(tb.amountCents)}</span>
            </div>
          ))}
        </>
      )}
      <div className="flex justify-between font-bold text-base border-t border-border pt-1">
        <span>TOTAL</span>
        <span className="tabular-nums">{fmtMoney(block.totalCents)}</span>
      </div>
    </div>
  );
}

function PaymentPreview({ block }: { block: PaymentBlock }) {
  return (
    <div className="space-y-1">
      {block.tenders.map((t, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex justify-between">
            <span>
              {t.label}
              {t.cardLast4 && <span className="text-muted-foreground ml-1">****{t.cardLast4}</span>}
            </span>
            <span className="tabular-nums">{fmtMoney(t.amountCents)}</span>
          </div>
          {t.tipCents > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground pl-2">
              <span>Tip</span>
              <span className="tabular-nums">{fmtMoney(t.tipCents)}</span>
            </div>
          )}
          {t.surchargeAmountCents > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground pl-2">
              <span>Surcharge</span>
              <span className="tabular-nums">{fmtMoney(t.surchargeAmountCents)}</span>
            </div>
          )}
          {t.authCode && (
            <p className="text-xs text-muted-foreground pl-2">Auth: {t.authCode}</p>
          )}
        </div>
      ))}
      {block.changeCents > 0 && (
        <div className="flex justify-between">
          <span>Change</span>
          <span className="tabular-nums">{fmtMoney(block.changeCents)}</span>
        </div>
      )}
      {block.totalTipCents > 0 && (
        <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
          <span>Total Tips</span>
          <span className="tabular-nums">{fmtMoney(block.totalTipCents)}</span>
        </div>
      )}
    </div>
  );
}

function FooterPreview({ block }: { block: FooterBlock }) {
  return (
    <div className="text-center space-y-1">
      {block.giftMessage && (
        <p className="text-sm italic">&ldquo;{block.giftMessage}&rdquo;</p>
      )}
      {block.thankYouMessage && (
        <p className="text-xs text-muted-foreground">{block.thankYouMessage}</p>
      )}
      {block.showReturnPolicy && block.returnPolicyText && (
        <p className="text-xs text-muted-foreground mt-1">{block.returnPolicyText}</p>
      )}
      {block.customLines.map((line, i) => (
        <p key={i} className="text-xs text-muted-foreground">{line}</p>
      ))}
    </div>
  );
}

function QrCodePreview({ block }: { block: QrCodeBlock }) {
  return (
    <div className="text-center space-y-1 py-1">
      <div className="inline-block border border-border rounded p-2">
        <div className="w-20 h-20 bg-accent/30 flex items-center justify-center text-xs text-muted-foreground">
          QR CODE
        </div>
      </div>
      {block.label && (
        <p className="text-xs text-muted-foreground">{block.label}</p>
      )}
    </div>
  );
}

function LoyaltyPreview({ block }: { block: LoyaltyBlock }) {
  return (
    <div className="text-center space-y-0.5 text-xs">
      {block.memberName && <p className="font-medium">{block.memberName}</p>}
      {block.memberNumber && <p className="text-muted-foreground">Member: {block.memberNumber}</p>}
      <p className="text-green-500">+{block.pointsEarned} points earned</p>
      <p className="text-muted-foreground">Balance: {block.pointsBalance} points</p>
    </div>
  );
}

function SignaturePreview({ block }: { block: SignatureBlock }) {
  return (
    <div className="space-y-3 py-2">
      {block.showTipLine && (
        <div className="flex items-end gap-2">
          <span className="text-xs shrink-0">Tip:</span>
          <div className="flex-1 border-b border-border min-w-0" />
        </div>
      )}
      {block.showSignatureLine && (
        <div className="flex items-end gap-2">
          <span className="text-xs shrink-0">Signature:</span>
          <div className="flex-1 border-b border-border min-w-0" />
        </div>
      )}
    </div>
  );
}

function WatermarkBanner({ block }: { block: WatermarkBlock }) {
  return (
    <div className="text-center py-1">
      <span className="text-sm font-bold tracking-wider text-amber-500 border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 rounded">
        {block.text}
      </span>
    </div>
  );
}

function RefundInfoPreview({ block }: { block: RefundInfoBlock }) {
  return (
    <div className="space-y-0.5 text-xs">
      <p>Original Order: #{block.originalOrderNumber}</p>
      <p>Refund Amount: {fmtMoney(block.refundAmountCents)}</p>
      <p>Method: {block.refundMethod}</p>
    </div>
  );
}

function VoidInfoPreview({ block }: { block: VoidInfoBlock }) {
  return (
    <div className="space-y-0.5 text-xs text-red-500">
      <p>Voided: {formatDate(block.voidedAt)}</p>
      {block.voidReason && <p>Reason: {block.voidReason}</p>}
      {block.voidedBy && <p>By: {block.voidedBy}</p>}
    </div>
  );
}

function ReprintInfoPreview({ block }: { block: ReprintInfoBlock }) {
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <p>Original Date: {formatDate(block.originalDate)}</p>
      {block.reprintReason && <p>Reason: {block.reprintReason}</p>}
    </div>
  );
}

// ── Block renderer dispatch ─────────────────────────────────────

function BlockRenderer({ block }: { block: ReceiptBlock }) {
  switch (block.type) {
    case 'header':
      return <HeaderPreview block={block} />;
    case 'order_info':
      return <OrderInfoPreview block={block} />;
    case 'items':
      return <ItemsPreview block={block} />;
    case 'totals':
      return <TotalsPreview block={block} />;
    case 'payment':
      return <PaymentPreview block={block} />;
    case 'footer':
      return <FooterPreview block={block} />;
    case 'qr_code':
      return <QrCodePreview block={block} />;
    case 'loyalty':
      return <LoyaltyPreview block={block} />;
    case 'signature':
      return <SignaturePreview block={block} />;
    case 'watermark':
      return <WatermarkBanner block={block} />;
    case 'refund_info':
      return <RefundInfoPreview block={block} />;
    case 'void_info':
      return <VoidInfoPreview block={block} />;
    case 'reprint_info':
      return <ReprintInfoPreview block={block} />;
    default:
      return null;
  }
}

// ── Separator insertion helper ──────────────────────────────────

const SEPARATOR_AFTER: Set<ReceiptBlock['type']> = new Set([
  'header',
  'order_info',
  'items',
  'totals',
  'payment',
]);

// ── Main component ──────────────────────────────────────────────

interface ReceiptPreviewProps {
  document: ReceiptDocument;
  /** Additional CSS class names */
  className?: string;
}

export function ReceiptPreview({ document: doc, className }: ReceiptPreviewProps) {
  return (
    <div className={`font-mono text-sm space-y-2 ${className ?? ''}`}>
      {doc.blocks.map((block, i) => (
        <div key={`${block.type}-${i}`}>
          <BlockRenderer block={block} />
          {SEPARATOR_AFTER.has(block.type) && i < doc.blocks.length - 1 && <Separator />}
        </div>
      ))}
    </div>
  );
}
