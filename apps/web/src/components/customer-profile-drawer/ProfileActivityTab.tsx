'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  MapPin,
  LogIn,
  LogOut,
  ShoppingBag,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerVisit, CustomerActivity } from '@/types/customers';

interface ProfileActivityTabProps {
  customerId: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  visit: LogIn,
  checkout: LogOut,
  purchase: ShoppingBag,
  default: Activity,
};

export function ProfileActivityTab({ customerId }: ProfileActivityTabProps) {
  const [activeSection, setActiveSection] = useState<'visits' | 'timeline'>('visits');
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMoreVisits, setHasMoreVisits] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(false);
  const [visitCursor, setVisitCursor] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [visitRes, activityRes] = await Promise.all([
        apiFetch<{ data: CustomerVisit[]; meta: { cursor: string | null; hasMore: boolean } }>(
          `/api/v1/customers/${customerId}/visits`,
        ),
        apiFetch<{ data: CustomerActivity[]; meta: { cursor: string | null; hasMore: boolean } }>(
          `/api/v1/customers/${customerId}/activities`,
        ),
      ]);

      setVisits(visitRes.data);
      setVisitCursor(visitRes.meta.cursor);
      setHasMoreVisits(visitRes.meta.hasMore);

      setActivities(activityRes.data);
      setActivityCursor(activityRes.meta.cursor);
      setHasMoreActivities(activityRes.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load activity'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadMoreVisits = async () => {
    if (!visitCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const res = await apiFetch<{
        data: CustomerVisit[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/customers/${customerId}/visits?cursor=${visitCursor}`);
      setVisits((prev) => [...prev, ...res.data]);
      setVisitCursor(res.meta.cursor);
      setHasMoreVisits(res.meta.hasMore);
    } catch {
      // fail silently
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreActivities = async () => {
    if (!activityCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const res = await apiFetch<{
        data: CustomerActivity[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/customers/${customerId}/activities?cursor=${activityCursor}`);
      setActivities((prev) => [...prev, ...res.data]);
      setActivityCursor(res.meta.cursor);
      setHasMoreActivities(res.meta.hasMore);
    } catch {
      // fail silently
    } finally {
      setLoadingMore(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading activity..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">Failed to load activity data.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Section toggle */}
      <div className="mb-4 flex rounded-lg border border-border bg-muted p-0.5">
        <button
          type="button"
          onClick={() => setActiveSection('visits')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeSection === 'visits'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Visits ({visits.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('timeline')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeSection === 'timeline'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Timeline ({activities.length})
        </button>
      </div>

      {/* Visits Section */}
      {activeSection === 'visits' && (
        <div className="space-y-3">
          {visits.length === 0 ? (
            <EmptyState title="No visits" description="No visit history found." />
          ) : (
            <>
              {visits.map((visit) => (
                <div
                  key={visit.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <LogIn className="mt-0.5 h-4 w-4 text-indigo-500" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {formatDate(visit.checkInAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Check-in: {formatTime(visit.checkInAt)}
                          {visit.checkOutAt && (
                            <> &middot; Check-out: {formatTime(visit.checkOutAt)}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {visit.durationMinutes !== null && (
                        <Badge variant="neutral">
                          <Clock className="mr-1 h-3 w-3" />
                          {visit.durationMinutes}m
                        </Badge>
                      )}
                      <Badge variant="info">{visit.checkInMethod}</Badge>
                    </div>
                  </div>
                  {visit.location && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {visit.location}
                    </div>
                  )}
                  {visit.notes && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{visit.notes}</p>
                  )}
                </div>
              ))}
              {hasMoreVisits && (
                <button
                  type="button"
                  onClick={loadMoreVisits}
                  disabled={loadingMore}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <ChevronDown className="h-4 w-4" />
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Timeline Section */}
      {activeSection === 'timeline' && (
        <div className="space-y-1">
          {activities.length === 0 ? (
            <EmptyState title="No activity" description="No activity timeline found." />
          ) : (
            <>
              <div className="relative ml-3 border-l-2 border-border pl-4">
                {activities.map((activity) => {
                  const Icon =
                    ACTIVITY_ICONS[activity.activityType] ?? Activity;
                  return (
                    <div key={activity.id} className="relative pb-4">
                      <div className="absolute -left-[1.375rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-muted">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {activity.title}
                        </p>
                        {activity.details && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {activity.details}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(activity.createdAt)}
                          {activity.createdBy && <> &middot; by {activity.createdBy}</>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMoreActivities && (
                <button
                  type="button"
                  onClick={loadMoreActivities}
                  disabled={loadingMore}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <ChevronDown className="h-4 w-4" />
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
