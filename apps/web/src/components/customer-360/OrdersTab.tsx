'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  Loader2,
  AlertTriangle,
  CreditCard,
  Calendar,
  Hash,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCustomerOrders } from '@/hooks/use-customer-360';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const ORDER_STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  placed: 'bg-green-500/10 text-green-500 border-green-500/30',
  voided: 'bg-red-500/10 text-red-500 border-red-500/30',
  held: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
};

function getOrderStatusColor(status: string): string {
  return ORDER_STATUS_COLORS[status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/30';
}

// ── Sub-components ──────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      <div className="animate-pulse h-8 rounded bg-muted" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse h-12 rounded bg-muted" />
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function OrdersTab({ customerId }: { customerId: string }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const router = useRouter();
  const {
    data,
    isLoading,
    isLoadingMore,
    error,
    mutate: refresh,
    loadMore,
  } = useCustomerOrders(customerId, { status: statusFilter, limit: 20 });

  const handleRowClick = useCallback(
    (orderId: string) => {
      router.push(`/orders/${orderId}`);
    },
    [router],
  );

  if (isLoading && !data) return <TableSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-red-500">Failed to load orders</p>
        <button type="button" onClick={refresh} className="text-sm text-indigo-500 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const orders = data?.items ?? [];

  return (
    <div className="space-y-4 p-4">
      {/* Status filter + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {[
            { key: 'all', label: 'All' },
            { key: 'placed', label: 'Placed' },
            { key: 'voided', label: 'Voided' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === opt.key
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ShoppingBag className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">No orders</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusFilter === 'voided'
              ? 'No voided orders for this customer.'
              : 'No order history for this customer.'}
          </p>
        </div>
      ) : (
        <>
          {/* Data table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Order #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Items</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Payment</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => handleRowClick(order.id)}
                    className="border-b border-border last:border-b-0 cursor-pointer hover:bg-accent transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-foreground font-medium">
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        {order.orderNumber || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {order.businessDate
                          ? formatDate(order.businessDate)
                          : formatDate(order.createdAt)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">
                      {order.itemCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground tabular-nums">
                      {formatMoney(order.totalCents)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant="outline" className={getOrderStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {order.tenderSummary ? (
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="h-3 w-3" />
                          {order.tenderSummary}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {data?.hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
