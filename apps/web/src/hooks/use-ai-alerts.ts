'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────────

export interface AlertCondition {
  metricSlug: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'change_pct_gt' | 'change_pct_lt';
  threshold: number;
  /** Compare against previous N periods (e.g., 7 for week-over-week) */
  comparisonPeriodDays?: number;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  conditions: AlertCondition[];
  /** All conditions must be true (AND) or any (OR) */
  conditionLogic: 'and' | 'or';
  /** Dimensions to scope the alert (e.g., locationId) */
  dimensionFilters: Record<string, string> | null;
  channels: AlertChannel[];
  /** Minimum hours between repeated alerts for the same rule */
  cooldownHours: number;
  severity: 'info' | 'warning' | 'critical';
  isActive: boolean;
  lensSlug: string | null;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
  triggerCount: number;
}

export interface AlertChannel {
  type: 'in_app' | 'email' | 'webhook';
  config: Record<string, unknown>;
}

export interface AlertNotification {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  /** Metric values that triggered the alert */
  triggerData: Record<string, unknown>;
  status: 'unread' | 'read' | 'dismissed';
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface CreateAlertRuleInput {
  name: string;
  description?: string;
  conditions: AlertCondition[];
  conditionLogic?: 'and' | 'or';
  dimensionFilters?: Record<string, string>;
  channels: AlertChannel[];
  cooldownHours?: number;
  severity?: 'info' | 'warning' | 'critical';
  lensSlug?: string;
}

export interface UpdateAlertRuleInput {
  name?: string;
  description?: string;
  conditions?: AlertCondition[];
  conditionLogic?: 'and' | 'or';
  dimensionFilters?: Record<string, string>;
  channels?: AlertChannel[];
  cooldownHours?: number;
  severity?: 'info' | 'warning' | 'critical';
  isActive?: boolean;
  lensSlug?: string;
}

// ── useAlertRules ─────────────────────────────────────────────────

export function useAlertRules() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: AlertRule[] }>(
        '/api/v1/semantic/alerts/rules',
      );
      setRules(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert rules');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = useCallback(async (input: CreateAlertRuleInput): Promise<AlertRule | null> => {
    try {
      const res = await apiFetch<{ data: AlertRule }>(
        '/api/v1/semantic/alerts/rules',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      await fetchRules();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alert rule');
      return null;
    }
  }, [fetchRules]);

  const updateRule = useCallback(async (ruleId: string, input: UpdateAlertRuleInput): Promise<AlertRule | null> => {
    try {
      const res = await apiFetch<{ data: AlertRule }>(
        `/api/v1/semantic/alerts/rules/${ruleId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      );
      await fetchRules();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert rule');
      return null;
    }
  }, [fetchRules]);

  const deleteRule = useCallback(async (ruleId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/semantic/alerts/rules/${ruleId}`, {
        method: 'DELETE',
      });
      await fetchRules();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete alert rule');
      return false;
    }
  }, [fetchRules]);

  return { rules, isLoading, error, refresh: fetchRules, createRule, updateRule, deleteRule };
}

// ── useAlertNotifications ─────────────────────────────────────────

interface UseAlertNotificationsOptions {
  unreadOnly?: boolean;
  severity?: 'info' | 'warning' | 'critical';
  limit?: number;
}

export function useAlertNotifications(opts: UseAlertNotificationsOptions = {}) {
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        unreadOnly: opts.unreadOnly,
        severity: opts.severity,
        limit: opts.limit,
      });
      const res = await apiFetch<{
        data: AlertNotification[];
        meta: { unreadCount: number };
      }>(`/api/v1/semantic/alerts/notifications${qs}`);
      setNotifications(res.data);
      setUnreadCount(res.meta.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [opts.unreadOnly, opts.severity, opts.limit]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = useCallback(async (notificationId: string): Promise<void> => {
    try {
      await apiFetch(`/api/v1/semantic/alerts/notifications/${notificationId}/read`, {
        method: 'POST',
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, status: 'read' as const, readAt: new Date().toISOString() }
            : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark notification as read');
    }
  }, []);

  const markDismissed = useCallback(async (notificationId: string): Promise<void> => {
    try {
      await apiFetch(`/api/v1/semantic/alerts/notifications/${notificationId}/dismiss`, {
        method: 'POST',
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, status: 'dismissed' as const, dismissedAt: new Date().toISOString() }
            : n,
        ),
      );
      setUnreadCount((prev) => {
        const wasPreviouslyUnread = notifications.find((n) => n.id === notificationId)?.status === 'unread';
        return wasPreviouslyUnread ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss notification');
    }
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markDismissed,
    refresh: fetchNotifications,
  };
}
