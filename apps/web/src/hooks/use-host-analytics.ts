import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types mirrored from backend ─────────────────────────────────

export interface HostAnalyticsResult {
  coversSummary: { actual: number; expected: number };
  waitTimeSummary: { avgQuotedMinutes: number; avgActualMinutes: number; accuracyPercent: number };
  turnTimeSummary: { totalTurns: number; avgMinutes: number; previousPeriodAvg: number };
  noShowSummary: { count: number; totalReservations: number; ratePercent: number };
  waitlistSummary: { totalAdded: number; totalSeated: number; conversionPercent: number };
  coversByHour: Array<{ hour: number; reservationCovers: number; walkInCovers: number }>;
  waitTimeScatter: Array<{ quotedMinutes: number; actualMinutes: number; partySize: number }>;
  turnTimeDistribution: Array<{ bucketLabel: string; count: number }>;
  noShowTrend: Array<{ date: string; count: number; movingAvg7d: number }>;
  peakHeatmap: Array<{ dayOfWeek: number; hour: number; covers: number }>;
}

export interface PreShiftReportFull {
  reservations: Array<{
    id: string;
    guestName: string;
    partySize: number;
    reservationTime: string;
    status: string;
    specialRequests: string | null;
    occasion: string | null;
    tags: string[];
    isVip: boolean;
    seatingPreference: string | null;
  }>;
  vipCount: number;
  largePartyCount: number;
  specialOccasionCount: number;
  totalCovers: number;
  totalReservations: number;
}

// ── useHostAnalytics ────────────────────────────────────────────

export function useHostAnalytics(
  locationId: string,
  startDate: string,
  endDate: string,
  mealPeriod?: string,
) {
  const [data, setData] = useState<HostAnalyticsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!locationId || !startDate || !endDate) return;
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ locationId, startDate, endDate, mealPeriod });
      const res = await apiFetch(`/api/v1/fnb/host/analytics${qs}`) as { data: HostAnalyticsResult };
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [locationId, startDate, endDate, mealPeriod]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refresh: fetch };
}

// ── usePreShiftReportFull ───────────────────────────────────────

export function usePreShiftReportFull(
  locationId: string,
  date: string,
  mealPeriod: string,
) {
  const [data, setData] = useState<PreShiftReportFull | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!locationId || !date || !mealPeriod) return;
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ locationId, date, mealPeriod });
      const res = await apiFetch(`/api/v1/fnb/host/pre-shift${qs}`) as { data: PreShiftReportFull };
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pre-shift report');
    } finally {
      setIsLoading(false);
    }
  }, [locationId, date, mealPeriod]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refresh: fetch };
}
