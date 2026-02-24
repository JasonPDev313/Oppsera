'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────────

export type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type GoalStatus = 'on_track' | 'at_risk' | 'behind' | 'exceeded' | 'completed' | 'expired';

export interface MetricGoal {
  id: string;
  name: string;
  description: string | null;
  metricSlug: string;
  metricDisplayName: string;
  targetValue: number;
  /** How close counts as "on_track" vs "at_risk" (0-1 fraction, default 0.9 = within 90%) */
  warningThreshold: number;
  period: GoalPeriod;
  /** ISO date string for when the goal period started */
  periodStart: string;
  /** ISO date string for when the goal period ends */
  periodEnd: string;
  dimensionFilters: Record<string, string> | null;
  lensSlug: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalPacingEntry {
  goalId: string;
  goalName: string;
  metricSlug: string;
  metricDisplayName: string;
  targetValue: number;
  currentValue: number;
  /** Where the metric should be right now based on elapsed time in the period */
  expectedValue: number;
  /** currentValue / targetValue (0–1+) */
  progressPct: number;
  /** currentValue / expectedValue (0–1+) */
  pacingPct: number;
  /** Projected end-of-period value based on current trajectory */
  projectedValue: number;
  status: GoalStatus;
  period: GoalPeriod;
  periodStart: string;
  periodEnd: string;
  /** Fraction of the period that has elapsed (0–1) */
  periodElapsedPct: number;
  /** Days remaining in the period */
  daysRemaining: number;
}

export interface CreateGoalInput {
  name: string;
  description?: string;
  metricSlug: string;
  targetValue: number;
  warningThreshold?: number;
  period: GoalPeriod;
  periodStart: string;
  periodEnd: string;
  dimensionFilters?: Record<string, string>;
  lensSlug?: string;
}

export interface UpdateGoalInput {
  name?: string;
  description?: string;
  targetValue?: number;
  warningThreshold?: number;
  periodEnd?: string;
  dimensionFilters?: Record<string, string>;
  isActive?: boolean;
}

// ── useMetricGoals ────────────────────────────────────────────────

export function useMetricGoals() {
  const [goals, setGoals] = useState<MetricGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: MetricGoal[] }>(
        '/api/v1/semantic/goals',
      );
      setGoals(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const createGoal = useCallback(async (input: CreateGoalInput): Promise<MetricGoal | null> => {
    try {
      const res = await apiFetch<{ data: MetricGoal }>(
        '/api/v1/semantic/goals',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      await fetchGoals();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create goal');
      return null;
    }
  }, [fetchGoals]);

  const updateGoal = useCallback(async (goalId: string, input: UpdateGoalInput): Promise<MetricGoal | null> => {
    try {
      const res = await apiFetch<{ data: MetricGoal }>(
        `/api/v1/semantic/goals/${goalId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      );
      await fetchGoals();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update goal');
      return null;
    }
  }, [fetchGoals]);

  const deleteGoal = useCallback(async (goalId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/semantic/goals/${goalId}`, {
        method: 'DELETE',
      });
      await fetchGoals();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete goal');
      return false;
    }
  }, [fetchGoals]);

  return { goals, isLoading, error, createGoal, updateGoal, deleteGoal, refresh: fetchGoals };
}

// ── useGoalPacing ─────────────────────────────────────────────────

interface UseGoalPacingOptions {
  /** Filter to specific goal IDs */
  goalIds?: string[];
  /** Filter to a specific lens */
  lensSlug?: string;
}

export function useGoalPacing(opts: UseGoalPacingOptions = {}) {
  const [pacing, setPacing] = useState<GoalPacingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPacing = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        goalIds: opts.goalIds?.join(','),
        lensSlug: opts.lensSlug,
      });
      const res = await apiFetch<{ data: GoalPacingEntry[] }>(
        `/api/v1/semantic/goals/pacing${qs}`,
      );
      setPacing(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goal pacing');
    } finally {
      setIsLoading(false);
    }
  }, [opts.goalIds, opts.lensSlug]);

  useEffect(() => {
    fetchPacing();
  }, [fetchPacing]);

  return { pacing, isLoading, error, refresh: fetchPacing };
}
