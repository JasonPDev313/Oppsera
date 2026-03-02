'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  Loader2,
  AlertTriangle,
  CreditCard,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
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

// ── Main Component ──────────────────────────────────────────────

interface ProfileOrdersTabProps {
  customerId: string;
}

export function ProfileOrdersTab({ customerId }: ProfileOrdersTabProps) {
  const router = useRouter();
  const {
    data,
    isLoading,
    isLoadingMore,
    error,
    mutate: refresh,
    loadMore,
  } = useCustomerOrders(customerId, { limit: 10 });

  const handleOrderClick = useCallback(
    (orderId: string) => {
      router.push(`/orders/${orderId}`);
    },
    [router],
  );

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-xs text-red-500">Failed to load orders</p>
        <button type="button" onClick={refresh} className="text-xs text-indigo-500 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const orders = data?.items ?? [];

  if (orders.length === 0) {
    return (
      <div className="p-3">
        <EmptyState
          icon={ShoppingBag}
          title="No orders"
          description="No order history for this customer."
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {/* Compact order cards */}
      {orders.map((order) => (
        <button
          key={order.id}
          type="button"
          onClick={() => handleOrderClick(order.id)}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left hover:bg-accent transition-colors group"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-foreground">
                #{order.orderNumber || '—'}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${getOrderStatusColor(order.status)}`}
              >
                {order.status}
              </Badge>
              <span className="ml-auto text-xs font-medium text-foreground tabular-nums">
                {formatMoney(order.totalCents)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              <span>
                {order.businessDate
                  ? formatDate(order.businessDate)
                  : formatDate(order.createdAt)}
              </span>
              <span>{order.itemCount} item{order.itemCount !== 1 ? 's' : ''}</span>
              {order.tenderSummary && (
                <span className="flex items-center gap-0.5">
                  <CreditCard className="h-2.5 w-2.5" />
                  {order.tenderSummary}
                </span>
              )}
            </div>
          </div>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ))}

      {/* Load more */}
      {data?.hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isLoadingMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {isLoadingMore ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Load more
        </button>
      )}
    </div>
  );
}
