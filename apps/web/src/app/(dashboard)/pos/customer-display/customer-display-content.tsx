'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useCustomerDisplayReceiver } from '@/hooks/use-customer-display';
import type { CustomerDisplayMessage } from '@/hooks/use-customer-display';
import type { Order } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CustomerDisplayContent() {
  const [order, setOrder] = useState<Order | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const thankYouTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up thank-you timer on unmount
  useEffect(() => {
    return () => {
      if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current);
    };
  }, []);

  const handleMessage = useCallback((msg: CustomerDisplayMessage) => {
    if (msg.type === 'payment-complete') {
      setShowThankYou(true);
      setOrder(null);
      // Clear any previous timer before starting a new one
      if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current);
      thankYouTimerRef.current = setTimeout(() => setShowThankYou(false), 5000);
    } else if (msg.type === 'clear') {
      setOrder(null);
      setShowThankYou(false);
    } else {
      setOrder(msg.order);
      setShowThankYou(false);
    }
  }, []);

  useCustomerDisplayReceiver(handleMessage);

  // ── Thank-you screen ──
  if (showThankYou) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-500/15">
          <Check className="h-14 w-14 text-green-500" />
        </div>
        <h1 className="mt-8 text-4xl font-bold text-foreground">Thank You!</h1>
        <p className="mt-3 text-xl text-muted-foreground">Your payment has been processed.</p>
      </div>
    );
  }

  // ── Idle screen (no active order) ──
  if (!order || !order.lines || order.lines.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-8">
        <ShoppingCart className="h-20 w-20 text-muted-foreground/30" />
        <h1 className="mt-6 text-3xl font-semibold text-foreground">Welcome</h1>
        <p className="mt-2 text-lg text-muted-foreground">Your order will appear here</p>
      </div>
    );
  }

  // ── Active order display ──
  const hasDiscount = order.discountTotal > 0;
  const hasCharges = order.serviceChargeTotal > 0;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-surface px-8 py-5">
        <h1 className="text-2xl font-bold text-foreground">Your Order</h1>
        <p className="text-sm text-muted-foreground">
          {order.lines.length} {order.lines.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* Line items */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        <div className="space-y-1">
          {order.lines.map((line, idx) => (
            <div
              key={line.id ?? idx}
              className="flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-surface"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-semibold text-indigo-500">
                  {line.qty}
                </span>
                <div>
                  <p className="text-lg font-medium text-foreground">{line.catalogItemName}</p>
                  {line.modifiers && line.modifiers.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {line.modifiers.map((m: { name: string }) => m.name).join(', ')}
                    </p>
                  )}
                  {line.specialInstructions && (
                    <p className="text-sm italic text-muted-foreground">
                      {line.specialInstructions}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {formatMoney(line.lineSubtotal)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="shrink-0 border-t border-border bg-surface px-8 py-5">
        <div className="mx-auto max-w-xl space-y-2">
          <div className="flex justify-between text-base text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(order.subtotal)}</span>
          </div>

          {hasDiscount && (
            <div className="flex justify-between text-base text-red-500">
              <span>Discount</span>
              <span className="tabular-nums">-{formatMoney(order.discountTotal)}</span>
            </div>
          )}

          {hasCharges && (
            <div className="flex justify-between text-base text-muted-foreground">
              <span>Service Charge</span>
              <span className="tabular-nums">{formatMoney(order.serviceChargeTotal)}</span>
            </div>
          )}

          <div className="flex justify-between text-base text-muted-foreground">
            <span>Tax{order.taxExempt ? ' (Exempt)' : ''}</span>
            <span className={`tabular-nums ${order.taxExempt ? 'text-purple-500 font-medium' : ''}`}>
              {order.taxExempt ? '$0.00' : formatMoney(order.taxTotal)}
            </span>
          </div>

          <div className="border-t border-border pt-3">
            <div className="flex justify-between">
              <span className="text-2xl font-bold text-foreground">TOTAL</span>
              <span className="text-3xl font-bold text-foreground tabular-nums">
                {formatMoney(order.total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
