'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Phone,
  MessageSquare,
  Bell,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerCommunication } from '@/types/customers';

interface ProfileCommunicationsTabProps {
  customerId: string;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  phone: Phone,
  sms: MessageSquare,
  push: Bell,
};

const STATUS_VARIANTS: Record<string, string> = {
  delivered: 'success',
  opened: 'success',
  clicked: 'success',
  sent: 'info',
  queued: 'neutral',
  pending: 'neutral',
  bounced: 'error',
  failed: 'error',
};

export function ProfileCommunicationsTab({
  customerId,
}: ProfileCommunicationsTabProps) {
  const [communications, setCommunications] = useState<CustomerCommunication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (channelFilter !== 'all') params.set('channel', channelFilter);

      const res = await apiFetch<{
        data: CustomerCommunication[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/customers/${customerId}/communications?${params.toString()}`);
      setCommunications(res.data);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load communications'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, channelFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const params = new URLSearchParams();
      params.set('cursor', cursor);
      if (channelFilter !== 'all') params.set('channel', channelFilter);

      const res = await apiFetch<{
        data: CustomerCommunication[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/customers/${customerId}/communications?${params.toString()}`);
      setCommunications((prev) => [...prev, ...res.data]);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch {
      // fail silently
    } finally {
      setLoadingMore(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading communications..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Failed to load communications.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Channel filter */}
      <div className="mb-4 flex gap-2">
        {['all', 'email', 'sms', 'phone', 'push'].map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => setChannelFilter(ch)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              channelFilter === ch
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {ch === 'all' ? 'All' : ch.charAt(0).toUpperCase() + ch.slice(1)}
          </button>
        ))}
      </div>

      {communications.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No communications"
          description="No communication history found for this customer."
        />
      ) : (
        <div className="space-y-2">
          {communications.map((comm) => {
            const ChannelIcon = CHANNEL_ICONS[comm.channel] || Mail;
            const DirectionIcon =
              comm.direction === 'outbound' ? ArrowUpRight : ArrowDownLeft;

            return (
              <div
                key={comm.id}
                className="rounded-lg border border-gray-200 p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex items-center gap-1">
                      <ChannelIcon className="h-4 w-4 text-gray-400" />
                      <DirectionIcon
                        className={`h-3 w-3 ${
                          comm.direction === 'outbound'
                            ? 'text-blue-400'
                            : 'text-green-400'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      {comm.subject && (
                        <p className="text-sm font-medium text-gray-900">
                          {comm.subject}
                        </p>
                      )}
                      {comm.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                          {comm.body}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                        <span>{formatDateTime(comm.createdAt)}</span>
                        {comm.createdBy && (
                          <>
                            <span>&middot;</span>
                            <span>{comm.createdBy}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1.5">
                    <Badge variant="neutral">{comm.channel}</Badge>
                    <Badge variant={STATUS_VARIANTS[comm.status] || 'neutral'}>
                      {comm.status}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronDown className="h-4 w-4" />
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
