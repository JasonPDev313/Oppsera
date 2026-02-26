'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, DollarSign, Printer, RotateCcw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthContext } from '@/components/auth-provider';
import { useOrder } from '@/hooks/use-orders';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { getItemTypeGroup, ITEM_TYPE_BADGES } from '@/types/catalog';
import { ReceiptView } from '@/components/orders/ReceiptView';
import type { OrderLine, OrderCharge, OrderDiscount } from '@/types/pos';

// ── Badge mappings ────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  open: { label: 'Open', variant: 'info' },
  placed: { label: 'Placed', variant: 'success' },
  voided: { label: 'Voided', variant: 'error' },
  paid: { label: 'Paid', variant: 'success' },
};

const SOURCE_BADGES: Record<string, { label: string; variant: string }> = {
  pos: { label: 'POS', variant: 'indigo' },
  online: { label: 'Online', variant: 'purple' },
  admin: { label: 'Admin', variant: 'neutral' },
  kiosk: { label: 'Kiosk', variant: 'orange' },
};

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Line Items Section ────────────────────────────────────────────

function LineItemsSection({ lines }: { lines: OrderLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">No line items</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Item
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Qty
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Unit Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tax
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lines
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((line) => {
              const group = getItemTypeGroup(line.itemType);
              const typeBadge = ITEM_TYPE_BADGES[group];
              const hasOverride =
                line.originalUnitPrice !== null &&
                line.originalUnitPrice !== line.unitPrice;

              return (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {line.catalogItemName}
                      </span>
                      {line.catalogItemSku && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {line.catalogItemSku}
                        </span>
                      )}
                    </div>

                    {/* Modifiers */}
                    {line.modifiers && line.modifiers.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {line.modifiers.map((mod, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            + {mod.name}
                            {mod.priceAdjustment !== 0 && (
                              <span className="ml-1">
                                {mod.priceAdjustment > 0 ? '+' : ''}
                                {formatMoney(mod.priceAdjustment)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Selected options */}
                    {line.selectedOptions &&
                      Object.keys(line.selectedOptions).length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {Object.entries(line.selectedOptions)
                            .map(([key, val]) => `${key}: ${val}`)
                            .join(', ')}
                        </div>
                      )}

                    {/* Special instructions */}
                    {line.specialInstructions && (
                      <div className="mt-1 text-xs italic text-muted-foreground">
                        &ldquo;{line.specialInstructions}&rdquo;
                      </div>
                    )}

                    {/* Notes */}
                    {line.notes && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Note: {line.notes}
                      </div>
                    )}

                    {/* Package components */}
                    {line.packageComponents && line.packageComponents.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {line.packageComponents.map((comp, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            &bull; {comp.itemName} x{comp.qty}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Price override reason */}
                    {hasOverride && line.priceOverrideReason && (
                      <div className="mt-1 text-xs text-amber-500">
                        Price override: {line.priceOverrideReason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-foreground">
                    {line.qty}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-foreground">
                    {hasOverride && (
                      <span className="mr-1 text-muted-foreground line-through">
                        {formatMoney(line.originalUnitPrice!)}
                      </span>
                    )}
                    {formatMoney(line.unitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {formatMoney(line.lineTax)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    {formatMoney(line.lineTotal)}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// ── Charges Section ───────────────────────────────────────────────

function ChargesSection({ charges }: { charges: OrderCharge[] }) {
  if (charges.length === 0) return null;

  return (
    <div className="space-y-2">
      {charges.map((charge) => (
        <div key={charge.id} className="flex items-center justify-between px-4 py-2">
          <div>
            <span className="text-sm text-foreground">{charge.name}</span>
            {charge.calculationType === 'percentage' && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({charge.value}%)
              </span>
            )}
            {charge.isTaxable && (
              <span className="ml-2 text-xs text-muted-foreground">(taxable)</span>
            )}
          </div>
          <span className="text-sm font-medium text-foreground">
            {formatMoney(charge.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Discounts Section ─────────────────────────────────────────────

function DiscountsSection({ discounts }: { discounts: OrderDiscount[] }) {
  if (discounts.length === 0) return null;

  return (
    <div className="space-y-2">
      {discounts.map((discount) => (
        <div key={discount.id} className="flex items-center justify-between px-4 py-2">
          <div>
            <span className="text-sm text-foreground">
              {discount.type === 'percentage'
                ? `${discount.value}% Discount`
                : 'Discount'}
            </span>
            {discount.reason && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({discount.reason})
              </span>
            )}
          </div>
          <span className="text-sm font-medium text-red-500">
            -{formatMoney(discount.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Tenders Section ──────────────────────────────────────────────

interface TenderRow {
  id: string;
  tenderType: string;
  tenderSequence: number;
  amount: number;
  tipAmount: number;
  changeGiven: number;
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

function TendersSection({ orderId, orderTotal, locationId }: { orderId: string; orderTotal: number; locationId: string }) {
  const [tenderData, setTenderData] = useState<TenderResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTenders() {
      try {
        const res = await apiFetch<{ data: TenderResponse }>(
          `/api/v1/orders/${orderId}/tenders?orderTotal=${orderTotal}`,
          { headers: { 'X-Location-Id': locationId } },
        );
        setTenderData(res.data);
      } catch {
        // No tenders yet — that's fine
      } finally {
        setIsLoading(false);
      }
    }
    fetchTenders();
  }, [orderId, orderTotal, locationId]);

  if (isLoading) return <div className="px-4 py-4"><div className="h-8 w-48 animate-pulse rounded bg-muted" /></div>;
  if (!tenderData || tenderData.tenders.length === 0) return null;

  return (
    <div className="space-y-2 px-4 py-4">
      {tenderData.tenders.map((tender) => (
        <div key={tender.id} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="text-sm text-foreground">
              {tender.tenderType === 'cash' ? 'Cash' : tender.tenderType} #{tender.tenderSequence}
            </span>
            {tender.isReversed && (
              <Badge variant="error">Reversed</Badge>
            )}
          </div>
          <div className="text-right">
            <span className={`text-sm font-medium ${tender.isReversed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {formatMoney(tender.amount)}
            </span>
            {tender.changeGiven > 0 && !tender.isReversed && (
              <span className="ml-2 text-xs text-muted-foreground">
                (Change: {formatMoney(tender.changeGiven)})
              </span>
            )}
            {tender.tipAmount > 0 && !tender.isReversed && (
              <span className="ml-2 text-xs text-blue-500">
                +{formatMoney(tender.tipAmount)} tip
              </span>
            )}
          </div>
        </div>
      ))}

      {/* Summary */}
      <div className="border-t border-border pt-2 mt-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Tendered</span>
          <span className="font-medium text-green-500">{formatMoney(tenderData.summary.totalTendered)}</span>
        </div>
        {tenderData.summary.remainingBalance > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-medium text-red-500">{formatMoney(tenderData.summary.remainingBalance)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Returns Section ─────────────────────────────────────────────

interface ReturnSummary {
  returnOrderId: string;
  returnOrderNumber: string;
  returnType: string;
  total: number;
  lineCount: number;
  createdAt: string;
}

function ReturnsSection({ orderId, locationId }: { orderId: string; locationId: string }) {
  const [returns, setReturns] = useState<ReturnSummary[]>([]);
  const [totalReturned, setTotalReturned] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchReturns() {
      try {
        const res = await apiFetch<{ data: { returns: ReturnSummary[]; totalReturnedCents: number } }>(
          `/api/v1/orders/${orderId}/returns`,
          { headers: { 'X-Location-Id': locationId } },
        );
        setReturns(res.data.returns);
        setTotalReturned(res.data.totalReturnedCents);
      } catch {
        // No returns — fine
      } finally {
        setIsLoading(false);
      }
    }
    fetchReturns();
  }, [orderId, locationId]);

  if (isLoading) return <div className="px-4 py-4"><div className="h-8 w-48 animate-pulse rounded bg-muted" /></div>;
  if (returns.length === 0) return null;

  return (
    <div className="space-y-2 px-4 py-4">
      {returns.map((r) => (
        <div key={r.returnOrderId} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-foreground">
              {r.returnOrderNumber} ({r.returnType})
            </span>
            <span className="text-xs text-muted-foreground">
              {r.lineCount} item{r.lineCount !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-sm font-medium text-red-500">
            -{formatMoney(Math.abs(r.total))}
          </span>
        </div>
      ))}
      <div className="border-t border-border pt-2 mt-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Returned</span>
          <span className="font-medium text-red-500">-{formatMoney(totalReturned)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { locations, tenant } = useAuthContext();
  const locationId = locations[0]?.id ?? '';
  const locationName = locations[0]?.name ?? '';
  const businessName = tenant?.name ?? '';
  const orderId = params.orderId as string;

  const { data: order, isLoading, mutate } = useOrder(orderId, locationId);

  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const handleVoid = useCallback(async () => {
    setIsVoiding(true);
    try {
      await apiFetch(`/api/v1/orders/${orderId}/void`, {
        method: 'POST',
        headers: { 'X-Location-Id': locationId },
      });
      toast.success('Order voided successfully');
      setShowVoidDialog(false);
      mutate();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to void order');
      toast.error(e.message);
    } finally {
      setIsVoiding(false);
    }
  }, [orderId, locationId, toast, mutate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-3 rounded-lg border border-border bg-surface p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // Not found state
  if (!order) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/orders')}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sales History
        </button>
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">Order not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The order you are looking for does not exist or has been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/orders')}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Go to Sales History
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = STATUS_BADGES[order.status] || {
    label: order.status,
    variant: 'neutral',
  };
  const sourceBadge = SOURCE_BADGES[order.source] || {
    label: order.source,
    variant: 'neutral',
  };
  const lines = order.lines || [];
  const charges = order.charges || [];
  const discounts = order.discounts || [];
  const isVoided = order.status === 'voided';

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push('/orders')}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Sales History
      </button>

      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Order {order.orderNumber}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
              <span className="text-sm text-muted-foreground">
                {formatDateTime(order.businessDate)}
              </span>
              <Badge variant={sourceBadge.variant}>{sourceBadge.label}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {order.terminalId && (
                <span>Terminal: {order.terminalId}</span>
              )}
              {order.employeeId && (
                <span>Employee: {order.employeeId}</span>
              )}
              {order.placedAt && (
                <span>Placed: {formatFullDateTime(order.placedAt)}</span>
              )}
              {order.createdAt && (
                <span>Created: {formatFullDateTime(order.createdAt)}</span>
              )}
            </div>
            {isVoided && order.voidedAt && (
              <div className="mt-2 text-sm text-red-500">
                Voided: {formatFullDateTime(order.voidedAt)}
                {order.voidReason && ` \u2014 ${order.voidReason}`}
              </div>
            )}
            {order.notes && (
              <div className="mt-2 text-sm text-muted-foreground">
                Notes: {order.notes}
              </div>
            )}
          </div>
          {!isVoided && (
            <button
              type="button"
              onClick={() => setShowVoidDialog(true)}
              className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              Void Order
            </button>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Line Items
          </h2>
        </div>
        <LineItemsSection lines={lines} />
      </div>

      {/* Charges */}
      {charges.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Charges
            </h2>
          </div>
          <ChargesSection charges={charges} />
        </div>
      )}

      {/* Discounts */}
      {discounts.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Discounts
            </h2>
          </div>
          <DiscountsSection discounts={discounts} />
        </div>
      )}

      {/* Tenders */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Payments
          </h2>
        </div>
        <TendersSection orderId={order.id} orderTotal={order.total} locationId={locationId} />
      </div>

      {/* Returns */}
      {order.status === 'paid' && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Returns
            </h2>
          </div>
          <ReturnsSection orderId={order.id} locationId={locationId} />
        </div>
      )}

      {/* Totals */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Totals
          </h2>
        </div>
        <div className="space-y-2 px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-sm text-foreground">{formatMoney(order.subtotal)}</span>
          </div>
          {order.serviceChargeTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Service Charges</span>
              <span className="text-sm text-foreground">
                {formatMoney(order.serviceChargeTotal)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tax</span>
            <span className="text-sm text-foreground">{formatMoney(order.taxTotal)}</span>
          </div>
          {order.discountTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Discounts</span>
              <span className="text-sm text-red-500">
                -{formatMoney(order.discountTotal)}
              </span>
            </div>
          )}
          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-foreground">Total</span>
              <span className="text-base font-semibold text-foreground">
                {formatMoney(order.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowReceipt(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Printer className="h-4 w-4" />
          Print Receipt
        </button>
        {order.status === 'paid' && (
          <button
            type="button"
            onClick={() => router.push(`/orders/${order.id}/return`)}
            className="flex items-center gap-2 rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-medium text-amber-500 transition-colors hover:bg-amber-500/10"
          >
            <RotateCcw className="h-4 w-4" />
            Process Return
          </button>
        )}
        {!isVoided && (
          <button
            type="button"
            onClick={() => setShowVoidDialog(true)}
            className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
          >
            <XCircle className="h-4 w-4" />
            Void Order
          </button>
        )}
      </div>

      {/* Void Confirmation Dialog */}
      <ConfirmDialog
        open={showVoidDialog}
        onClose={() => setShowVoidDialog(false)}
        onConfirm={handleVoid}
        title="Void Order"
        description={`Are you sure you want to void order ${order.orderNumber}? This action cannot be undone.`}
        confirmLabel="Void Order"
        destructive
        isLoading={isVoiding}
      />

      {/* Receipt View (80mm thermal print) */}
      <ReceiptView
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        order={order}
        businessName={businessName}
        locationName={locationName}
        locationId={locationId}
      />
    </div>
  );
}
