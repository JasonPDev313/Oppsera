'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────

export type AiResponseDepth = 'concise' | 'default' | 'detailed';
export type AiTonePreference = 'professional' | 'casual' | 'executive';

export interface AiPreferences {
  /** Preferred response depth for AI insights */
  responseDepth: AiResponseDepth;
  /** Tone preference for narrative responses */
  tone: AiTonePreference;
  /** Default lens slug for new conversations */
  defaultLensSlug: string | null;
  /** Default timezone for date-based queries */
  timezone: string;
  /** Whether to show raw data tables alongside narratives */
  showDataTables: boolean;
  /** Whether to show debug/technical information (SQL, plan, etc.) */
  showDebugInfo: boolean;
  /** Whether to receive proactive insight notifications */
  proactiveInsightsEnabled: boolean;
  /** Preferred metrics to highlight in dashboards and digests */
  pinnedMetrics: string[];
  /** Metrics the user has explicitly hidden */
  hiddenMetrics: string[];
  /** Maximum number of suggested questions to show */
  maxSuggestions: number;
  /** Whether to auto-expand the chat history sidebar on desktop */
  autoExpandHistory: boolean;
  /** Preferred chart types per metric (overrides system defaults) */
  chartPreferences: Record<string, 'line' | 'bar' | 'area' | 'pie'>;
  /** Email notification preferences for AI features */
  emailNotifications: EmailNotificationPreferences;
  updatedAt: string;
}

export interface EmailNotificationPreferences {
  /** Receive alert notifications via email */
  alerts: boolean;
  /** Receive digest emails */
  digests: boolean;
  /** Receive weekly summary emails */
  weeklySummary: boolean;
  /** Receive goal pacing warnings via email */
  goalWarnings: boolean;
}

export interface UpdateAiPreferencesInput {
  responseDepth?: AiResponseDepth;
  tone?: AiTonePreference;
  defaultLensSlug?: string | null;
  timezone?: string;
  showDataTables?: boolean;
  showDebugInfo?: boolean;
  proactiveInsightsEnabled?: boolean;
  pinnedMetrics?: string[];
  hiddenMetrics?: string[];
  maxSuggestions?: number;
  autoExpandHistory?: boolean;
  chartPreferences?: Record<string, 'line' | 'bar' | 'area' | 'pie'>;
  emailNotifications?: Partial<EmailNotificationPreferences>;
}

// ── Default preferences (used before first server load) ───────────

const DEFAULT_PREFERENCES: AiPreferences = {
  responseDepth: 'default',
  tone: 'professional',
  defaultLensSlug: null,
  timezone: typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'America/New_York',
  showDataTables: true,
  showDebugInfo: false,
  proactiveInsightsEnabled: true,
  pinnedMetrics: [],
  hiddenMetrics: [],
  maxSuggestions: 4,
  autoExpandHistory: true,
  chartPreferences: {},
  emailNotifications: {
    alerts: true,
    digests: true,
    weeklySummary: true,
    goalWarnings: true,
  },
  updatedAt: new Date().toISOString(),
};

// ── useAiPreferences ──────────────────────────────────────────────

export function useAiPreferences() {
  const [preferences, setPreferences] = useState<AiPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: AiPreferences }>(
        '/api/v1/semantic/preferences',
      );
      setPreferences(res.data);
    } catch (err) {
      // On 404 (preferences not yet created), keep defaults
      if (err instanceof Error && 'statusCode' in err && (err as any).statusCode === 404) {
        setPreferences(DEFAULT_PREFERENCES);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load AI preferences');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreferences = useCallback(async (input: UpdateAiPreferencesInput): Promise<AiPreferences | null> => {
    try {
      const res = await apiFetch<{ data: AiPreferences }>(
        '/api/v1/semantic/preferences',
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      );
      setPreferences(res.data);
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update AI preferences');
      return null;
    }
  }, []);

  return { preferences, isLoading, error, updatePreferences, refresh: fetchPreferences };
}
