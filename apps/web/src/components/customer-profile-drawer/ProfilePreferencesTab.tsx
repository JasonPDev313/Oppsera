'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Sparkles, UserCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerPreference } from '@/types/customers';

interface ProfilePreferencesTabProps {
  customerId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  food_bev: 'Food & Beverage',
  golf: 'Golf',
  retail: 'Retail',
  service: 'Service',
  facility: 'Facility',
  general: 'General',
  dietary: 'Dietary',
  communication: 'Communication',
  scheduling: 'Scheduling',
};

const SOURCE_VARIANTS: Record<string, string> = {
  manual: 'neutral',
  inferred: 'info',
  imported: 'purple',
};

export function ProfilePreferencesTab({ customerId }: ProfilePreferencesTabProps) {
  const [preferences, setPreferences] = useState<CustomerPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: CustomerPreference[] }>(
        `/api/v1/customers/${customerId}/preferences`,
      );
      setPreferences(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load preferences'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading preferences..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">Failed to load preferences.</p>
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

  if (preferences.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Settings}
          title="No preferences"
          description="No preferences have been recorded for this customer."
        />
      </div>
    );
  }

  // Group preferences by category
  const grouped = preferences.reduce<Record<string, CustomerPreference[]>>((acc, pref) => {
    const cat = pref.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(pref);
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-6">
      {Object.entries(grouped).map(([category, prefs]) => (
        <section key={category}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {CATEGORY_LABELS[category] || category}
          </h3>
          <div className="space-y-2">
            {prefs.map((pref) => (
              <div
                key={pref.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {pref.source === 'inferred' ? (
                    <Sparkles className="h-4 w-4 text-blue-400" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{pref.key}</span>
                      <span className="mx-1.5 text-muted-foreground">:</span>
                      <span className="text-foreground">{pref.value}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={SOURCE_VARIANTS[pref.source] || 'neutral'}>
                    {pref.source}
                    {pref.confidence !== null && (
                      <span className="ml-1">
                        {Math.round(pref.confidence * 100)}%
                      </span>
                    )}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(pref.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
