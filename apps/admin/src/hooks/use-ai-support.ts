'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ─────────────────────────────────────────────────────────

export interface AiThreadListItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userId: string;
  currentRoute: string | null;
  moduleKey: string | null;
  status: string;
  questionType: string | null;
  issueTag: string | null;
  messageCount: number;
  latestConfidence: string | null;
  latestRating: string | null;
  firstUserMessage: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface AiThreadMessage {
  id: string;
  role: string;
  messageText: string;
  modelName: string | null;
  promptVersion: string | null;
  answerConfidence: string | null;
  sourceTierUsed: string | null;
  citationsJson: unknown;
  feedbackStatus: string | null;
  feedbackRating: string | null;
  feedbackReasonCode: string | null;
  feedbackComment: string | null;
  createdAt: string;
}

export interface AiContextSnapshot {
  id: string;
  messageId: string;
  route: string | null;
  screenTitle: string | null;
  moduleKey: string | null;
  roleKeysJson: unknown;
  featureFlagsJson: unknown;
  enabledModulesJson: unknown;
  visibleActionsJson: unknown;
  uiStateJson: unknown;
  tenantSettingsJson: unknown;
  createdAt: string;
}

export interface AiThreadDetail {
  thread: {
    id: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    userId: string;
    sessionId: string | null;
    channel: string;
    currentRoute: string | null;
    moduleKey: string | null;
    status: string;
    questionType: string | null;
    outcome: string | null;
    issueTag: string | null;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  messages: AiThreadMessage[];
  contextSnapshots: AiContextSnapshot[];
}

export interface AiMetrics {
  period: string;
  questionsAsked: number;
  lowConfidenceRate: number;
  thumbsDownRate: number;
  topModule: string | null;
  lowConfidenceCount: number;
  thumbsDownCount: number;
  totalFeedback: number;
  assistantMessages: number;
  topScreens: { route: string; moduleKey: string | null; threadCount: number }[];
  topQuestions: { questionSnippet: string; moduleKey: string | null; occurrences: number }[];
}

export interface AiInboxFilters {
  tenantId?: string;
  moduleKey?: string;
  status?: string;
  confidence?: string;
  rating?: string;
  questionType?: string;
  issueTag?: string;
}

// ── Inbox Hook ───────────────────────────────────────────────────

export function useAiSupportInbox(filters: AiInboxFilters = {}) {
  const [threads, setThreads] = useState<AiThreadListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const buildParams = useCallback(
    (extra: Record<string, string> = {}): URLSearchParams => {
      const params: Record<string, string> = { ...extra };
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.moduleKey) params.moduleKey = filters.moduleKey;
      if (filters.status) params.status = filters.status;
      if (filters.confidence) params.confidence = filters.confidence;
      if (filters.rating) params.rating = filters.rating;
      if (filters.questionType) params.questionType = filters.questionType;
      if (filters.issueTag) params.issueTag = filters.issueTag;
      return new URLSearchParams(params);
    },
    [filters],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildParams();
      const res = await adminFetch<{
        data: { items: AiThreadListItem[]; cursor: string | null; hasMore: boolean };
      }>(`/api/v1/ai-support/threads?${qs}`);
      setThreads(res.data.items);
      setCursor(res.data.cursor);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load threads');
    } finally {
      setIsLoading(false);
    }
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setIsLoading(true);
    try {
      const qs = buildParams({ cursor });
      const res = await adminFetch<{
        data: { items: AiThreadListItem[]; cursor: string | null; hasMore: boolean };
      }>(`/api/v1/ai-support/threads?${qs}`);
      setThreads((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.cursor);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more threads');
    } finally {
      setIsLoading(false);
    }
  }, [cursor, buildParams]);

  return { threads, isLoading, error, hasMore, load, loadMore };
}

// ── Thread Detail Hook ───────────────────────────────────────────

export function useAiSupportThread(threadId: string) {
  const [detail, setDetail] = useState<AiThreadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: AiThreadDetail }>(
        `/api/v1/ai-support/threads/${threadId}`,
      );
      setDetail(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load thread');
    } finally {
      setIsLoading(false);
    }
  }, [threadId]);

  return { detail, isLoading, error, load };
}

// ── Metrics Hook ─────────────────────────────────────────────────

export function useAiSupportMetrics(period: '7d' | '30d' | '90d' = '7d') {
  const [metrics, setMetrics] = useState<AiMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: AiMetrics }>(
        `/api/v1/ai-support/metrics?period=${period}`,
      );
      setMetrics(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  return { metrics, isLoading, error, load };
}

// ═══════════════════════════════════════════════════════════════════
// Review Queue + Answer Cards
// ═══════════════════════════════════════════════════════════════════

export interface ReviewQueueItem {
  messageId: string;
  threadId: string;
  tenantId: string;
  messageText: string;
  answerConfidence: string | null;
  sourceTierUsed: string | null;
  createdAt: string;
  feedbackRating: string | null;
  feedbackComment: string | null;
  reviewStatus: string | null;
  correctedAnswer: string | null;
}

export interface AnswerCard {
  id: string;
  tenantId: string | null;
  slug: string;
  moduleKey: string | null;
  route: string | null;
  questionPattern: string;
  approvedAnswerMarkdown: string;
  version: number;
  status: 'draft' | 'active' | 'stale' | 'archived';
  ownerUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SubmitReviewInput {
  messageId: string;
  threadId: string;
  reviewStatus: 'approved' | 'edited' | 'rejected' | 'needs_kb_update';
  reviewNotes?: string | null;
  correctedAnswer?: string | null;
  questionNormalized?: string | null;
  screenKey?: string | null;
  moduleKey?: string | null;
}

export interface CreateAnswerCardInput {
  slug: string;
  questionPattern: string;
  approvedAnswerMarkdown: string;
  moduleKey?: string | null;
  route?: string | null;
  status?: 'draft' | 'active' | 'stale' | 'archived';
  tenantId?: string | null;
  ownerUserId?: string | null;
}

export interface UpdateAnswerCardInput {
  slug?: string;
  questionPattern?: string;
  approvedAnswerMarkdown?: string;
  moduleKey?: string | null;
  route?: string | null;
  status?: 'draft' | 'active' | 'stale' | 'archived';
  ownerUserId?: string | null;
}

export interface ReviewQueueFilters {
  tenantId?: string;
  limit?: number;
}

export interface AnswerCardFilters {
  status?: 'draft' | 'active' | 'stale' | 'archived';
  moduleKey?: string;
  limit?: number;
}

// ── useReviewQueue ───────────────────────────────────────────────────

export function useReviewQueue(filters: ReviewQueueFilters = {}) {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.tenantId) params.set('tenantId', filters.tenantId);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();

    adminFetch<{ data: { items: ReviewQueueItem[] } }>(
      `/api/v1/ai-support/reviews${qs ? `?${qs}` : ''}`,
    )
      .then((res) => setItems(res.data.items))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load review queue'),
      )
      .finally(() => setIsLoading(false));
  }, [filters.tenantId, filters.limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, isLoading, error, reload: load };
}

// ── useAnswerCards ───────────────────────────────────────────────────

export function useAnswerCards(filters: AnswerCardFilters = {}) {
  const [cards, setCards] = useState<AnswerCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.moduleKey) params.set('moduleKey', filters.moduleKey);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();

    adminFetch<{ data: { items: AnswerCard[] } }>(
      `/api/v1/ai-support/answers${qs ? `?${qs}` : ''}`,
    )
      .then((res) => setCards(res.data.items))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load answer cards'),
      )
      .finally(() => setIsLoading(false));
  }, [filters.status, filters.moduleKey, filters.limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { cards, isLoading, error, reload: load };
}

// ── submitReview ─────────────────────────────────────────────────────

export async function submitReview(
  data: SubmitReviewInput,
): Promise<{ id: string; reviewStatus: string }> {
  const res = await adminFetch<{ data: { id: string; reviewStatus: string } }>(
    '/api/v1/ai-support/reviews',
    { method: 'POST', body: JSON.stringify(data) },
  );
  return res.data;
}

// ── createAnswerCard ─────────────────────────────────────────────────

export async function createAnswerCard(data: CreateAnswerCardInput): Promise<AnswerCard> {
  const res = await adminFetch<{ data: AnswerCard }>(
    '/api/v1/ai-support/answers',
    { method: 'POST', body: JSON.stringify(data) },
  );
  return res.data;
}

// ── useAiSupportAnalytics ─────────────────────────────────────────────

export interface AiAnalyticsTierBucket {
  tier: string;
  count: number;
  percentage: number;
}

export interface AiAnalyticsDailyPoint {
  date: string;
  questions: number;
  answered: number;
  lowConfidence: number;
  thumbsDown: number;
}

export interface AiAnalyticsTopScreen {
  route: string;
  moduleKey: string;
  count: number;
}

export interface AiAnalyticsTopQuestion {
  question: string;
  count: number;
  route: string;
}

export interface AiAnalyticsFailureCluster {
  questionType: string;
  issueTag: string;
  count: number;
  screenRoute: string;
}

export interface AiAutoDraftMetrics {
  totalCreated: number;
  createdThisPeriod: number;
  pendingReview: number;
  activated: number;
  archived: number;
  acceptanceRate: number;
}

export interface AiAnalyticsData {
  totalQuestions: number;
  answeredCount: number;
  escalatedCount: number;
  answerRate: number;
  positiveFeedbackRate: number;
  negativeFeedbackRate: number;
  lowConfidenceRate: number;
  escalationRate: number;
  sourceTierDistribution: AiAnalyticsTierBucket[];
  approvedAnswerHitRate: number;
  dailyTrends: AiAnalyticsDailyPoint[];
  topScreens: AiAnalyticsTopScreen[];
  topQuestions: AiAnalyticsTopQuestion[];
  failureClusters: AiAnalyticsFailureCluster[];
  medianTimeToReview: number;
  reviewedCount: number;
  pendingReviewCount: number;
  deflectionEstimate: number;
  autoDraft?: AiAutoDraftMetrics;
}

export function useAiSupportAnalytics(
  period: '7d' | '30d' | '90d' = '30d',
  tenantId?: string,
  moduleKey?: string,
) {
  const [analytics, setAnalytics] = useState<AiAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (tenantId) params.set('tenantId', tenantId);
      if (moduleKey) params.set('moduleKey', moduleKey);
      const res = await adminFetch<{ data: AiAnalyticsData }>(
        `/api/v1/ai-support/analytics?${params.toString()}`,
      );
      setAnalytics(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [period, tenantId, moduleKey]);

  return { analytics, isLoading, error, load };
}

// ── bulkUpdateAnswerCardStatus ───────────────────────────────────────

export async function bulkUpdateAnswerCardStatus(
  ids: string[],
  status: 'draft' | 'active' | 'stale' | 'archived',
): Promise<{ updatedCount: number; status: string }> {
  const res = await adminFetch<{ data: { updatedCount: number; status: string } }>(
    '/api/v1/ai-support/answers/bulk-status',
    { method: 'POST', body: JSON.stringify({ ids, status }) },
  );
  return res.data;
}

// ── updateAnswerCard ─────────────────────────────────────────────────

export async function updateAnswerCard(
  id: string,
  data: UpdateAnswerCardInput,
): Promise<{ id: string; version: number; updated: boolean }> {
  const res = await adminFetch<{ data: { id: string; version: number; updated: boolean } }>(
    `/api/v1/ai-support/answers/${id}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
  return res.data;
}

// ═══════════════════════════════════════════════════════════════════
// Feature Gaps — AI-detected product gaps from unanswered questions
// ═══════════════════════════════════════════════════════════════════

export type FeatureGapStatus = 'open' | 'under_review' | 'planned' | 'shipped' | 'dismissed';
export type FeatureGapPriority = 'critical' | 'high' | 'medium' | 'low';

export interface FeatureGap {
  id: string;
  tenantId: string | null;
  questionNormalized: string;
  moduleKey: string | null;
  route: string | null;
  occurrenceCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sampleQuestion: string;
  sampleThreadId: string | null;
  sampleConfidence: string | null;
  status: FeatureGapStatus;
  priority: FeatureGapPriority;
  adminNotes: string | null;
  featureRequestId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FeatureGapSummary {
  total: number;
  openCount: number;
  underReviewCount: number;
  plannedCount: number;
  shippedCount: number;
  dismissedCount: number;
  criticalCount: number;
  highCount: number;
  totalOccurrences: number;
  uniqueModules: number;
  latestGapAt: string | null;
}

export interface FeatureGapFilters {
  status?: FeatureGapStatus;
  moduleKey?: string;
  priority?: FeatureGapPriority;
  sortBy?: 'frequency' | 'recent' | 'priority';
  limit?: number;
}

// ── useFeatureGaps ─────────────────────────────────────────────────

export function useFeatureGaps(filters: FeatureGapFilters = {}) {
  const [gaps, setGaps] = useState<FeatureGap[]>([]);
  const [summary, setSummary] = useState<FeatureGapSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.moduleKey) params.set('moduleKey', filters.moduleKey);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();

    adminFetch<{ data: { items: FeatureGap[]; summary: FeatureGapSummary } }>(
      `/api/v1/ai-support/feature-gaps${qs ? `?${qs}` : ''}`,
    )
      .then((res) => {
        setGaps(res.data.items);
        setSummary(res.data.summary);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load feature gaps'),
      )
      .finally(() => setIsLoading(false));
  }, [filters.status, filters.moduleKey, filters.priority, filters.sortBy, filters.limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { gaps, summary, isLoading, error, reload: load };
}

// ── updateFeatureGap ─────────────────────────────────────────────────

export interface UpdateFeatureGapInput {
  status?: FeatureGapStatus;
  priority?: FeatureGapPriority;
  adminNotes?: string;
  featureRequestId?: string;
}

export async function updateFeatureGap(
  id: string,
  data: UpdateFeatureGapInput,
): Promise<{ id: string; status: string; priority: string; occurrenceCount: number }> {
  const res = await adminFetch<{
    data: { id: string; status: string; priority: string; occurrenceCount: number };
  }>(
    `/api/v1/ai-support/feature-gaps/${id}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
  return res.data;
}
