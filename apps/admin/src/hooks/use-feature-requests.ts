'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

export interface FeatureRequest {
  id: string;
  tenantId: string;
  tenantName: string | null;
  locationId: string | null;
  submittedBy: string;
  submittedByName: string | null;
  submittedByEmail: string | null;
  requestType: 'feature' | 'enhancement' | 'bug';
  module: string;
  submodule: string | null;
  title: string;
  description: string;
  businessImpact: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  additionalNotes: string | null;
  currentWorkaround: string | null;
  status: string;
  adminNotes: string | null;
  tags: string[] | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  voteCount: number;
  attachmentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureRequestStats {
  total: number;
  submitted: number;
  underReview: number;
  planned: number;
  inProgress: number;
  completed: number;
  declined: number;
}

export interface ModuleStat {
  module: string;
  count: number;
  open: number;
}

export interface SimilarRequest {
  id: string;
  title: string;
  status: string;
  priority: string;
  requestType: string;
  createdAt: string;
}

export interface SubmitterHistoryItem {
  id: string;
  title: string;
  status: string;
  requestType: string;
  module: string;
  createdAt: string;
}

interface Filters {
  status?: string;
  search?: string;
  module?: string;
  priority?: string;
  tag?: string;
}

// ── Smart Scoring ────────────────────────────────────────────────

const COMPLEXITY_KEYWORDS: Record<string, number> = {
  'integration': 3, 'api': 2, 'database': 3, 'migration': 4, 'schema': 3,
  'auth': 3, 'authentication': 3, 'authorization': 3, 'rbac': 3, 'permission': 2,
  'real-time': 3, 'realtime': 3, 'websocket': 3, 'streaming': 3,
  'payment': 3, 'billing': 3, 'invoice': 2, 'tax': 2,
  'report': 2, 'reporting': 2, 'analytics': 2, 'dashboard': 2,
  'multi-tenant': 3, 'multi-location': 3, 'cross-module': 3,
  'security': 3, 'encryption': 3, 'audit': 2,
  'workflow': 2, 'automation': 2, 'scheduler': 2, 'cron': 2,
  'import': 2, 'export': 2, 'csv': 1, 'pdf': 2,
  'notification': 2, 'email': 2, 'sms': 2,
  'refactor': 2, 'rewrite': 3, 'redesign': 3, 'overhaul': 4,
  'performance': 2, 'optimization': 2, 'cache': 2,
  'button': -1, 'label': -1, 'text': -1, 'typo': -2, 'spelling': -2,
  'color': -1, 'font': -1, 'style': -1, 'css': -1,
  'tooltip': -1, 'placeholder': -1, 'message': -1,
  'sort': -1, 'filter': 0, 'search': 0,
  'toggle': -1, 'checkbox': -1, 'dropdown': -1,
};

const IMPACT_KEYWORDS: Record<string, number> = {
  'revenue': 4, 'sales': 3, 'money': 3, 'cost': 2, 'profit': 3,
  'customer': 3, 'client': 3, 'guest': 2,
  'time': 2, 'hours': 3, 'minutes': 2, 'daily': 2, 'every day': 3,
  'manual': 2, 'tedious': 2, 'frustrating': 2, 'painful': 2,
  'error': 2, 'mistake': 2, 'wrong': 2, 'incorrect': 2,
  'slow': 2, 'fast': 1, 'quick': 1, 'speed': 2,
  'compliance': 3, 'legal': 3, 'regulation': 3, 'audit': 2,
  'block': 3, 'blocker': 4, 'cannot': 3, 'unable': 3, 'broken': 3,
  'workaround': 2, 'hack': 2,
  'all users': 3, 'everyone': 3, 'all staff': 3, 'entire team': 3,
};

export interface SmartScore {
  difficulty: 'trivial' | 'easy' | 'moderate' | 'hard' | 'complex';
  difficultyScore: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  impactScore: number;
  priorityRank: number;
  reasoning: string[];
}

export function computeSmartScore(req: FeatureRequest): SmartScore {
  const allText = [
    req.title, req.description, req.businessImpact ?? '',
    req.additionalNotes ?? '', req.currentWorkaround ?? '',
  ].join(' ').toLowerCase();

  const reasoning: string[] = [];
  let diffPoints = 0;

  const matchedComplexity: string[] = [];
  for (const [keyword, weight] of Object.entries(COMPLEXITY_KEYWORDS)) {
    if (allText.includes(keyword)) {
      diffPoints += weight;
      if (weight >= 2) matchedComplexity.push(keyword);
    }
  }
  if (matchedComplexity.length > 0) reasoning.push(`Complexity: ${matchedComplexity.slice(0, 4).join(', ')}`);

  if (req.description.length > 500) { diffPoints += 2; reasoning.push('Large scope (detailed desc)'); }
  else if (req.description.length < 50) { diffPoints -= 1; }

  if (req.requestType === 'bug') { diffPoints -= 1; reasoning.push('Bug fix (focused)'); }
  else if (req.requestType === 'feature') { diffPoints += 2; reasoning.push('New feature'); }

  const complexModules = ['Accounting', 'PMS', 'Payments', 'Orders', 'Inventory'];
  if (complexModules.some(m => req.module.includes(m))) {
    diffPoints += 2;
    reasoning.push(`${req.module} = complex domain`);
  }

  const rawDiff = Math.max(0, Math.min(100, (diffPoints + 5) * 5));
  const difficulty: SmartScore['difficulty'] =
    rawDiff <= 15 ? 'trivial' : rawDiff <= 30 ? 'easy' : rawDiff <= 55 ? 'moderate' : rawDiff <= 75 ? 'hard' : 'complex';

  let impactPoints = 0;
  const matchedImpact: string[] = [];
  for (const [keyword, weight] of Object.entries(IMPACT_KEYWORDS)) {
    if (allText.includes(keyword)) {
      impactPoints += weight;
      if (weight >= 2) matchedImpact.push(keyword);
    }
  }
  if (matchedImpact.length > 0) reasoning.push(`Impact: ${matchedImpact.slice(0, 4).join(', ')}`);

  if (req.businessImpact && req.businessImpact.length > 20) { impactPoints += 2; reasoning.push('Business impact described'); }
  const priorityBoost: Record<string, number> = { critical: 4, high: 2, medium: 0, low: -2 };
  impactPoints += priorityBoost[req.priority] ?? 0;
  if (req.priority === 'critical') reasoning.push('User: critical');
  if (req.currentWorkaround && req.currentWorkaround.length > 10) { impactPoints -= 1; reasoning.push('Has workaround'); }

  // Vote boost
  if (req.voteCount > 0) { impactPoints += Math.min(req.voteCount, 5); reasoning.push(`${req.voteCount} votes`); }

  const rawImpact = Math.max(0, Math.min(100, (impactPoints + 3) * 7));
  const impact: SmartScore['impact'] =
    rawImpact <= 20 ? 'low' : rawImpact <= 45 ? 'medium' : rawImpact <= 70 ? 'high' : 'critical';

  const safeDiff = Math.max(rawDiff, 5);
  const priorityRank = Math.round((rawImpact / safeDiff) * 100);

  return { difficulty, difficultyScore: rawDiff, impact, impactScore: rawImpact, priorityRank, reasoning };
}

// ── Age helpers ──────────────────────────────────────────────────

const STALE_DAYS = 7;

export function getAgeDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

export function isStale(item: FeatureRequest): boolean {
  return item.status === 'submitted' && getAgeDays(item.createdAt) >= STALE_DAYS;
}

// ── Hook ─────────────────────────────────────────────────────────

export function useFeatureRequests(initialFilters?: Filters) {
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [stats, setStats] = useState<FeatureRequestStats | null>(null);
  const [moduleStats, setModuleStats] = useState<ModuleStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters ?? {});
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController>(null);

  const fetchData = useCallback(async (append = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);
      if (filters.module) params.set('module', filters.module);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.tag) params.set('tag', filters.tag);
      if (append && cursor) params.set('cursor', cursor);

      const qs = params.toString();
      const json = await adminFetch<{
        data: FeatureRequest[];
        meta: { cursor?: string; hasMore: boolean };
        stats: FeatureRequestStats;
        moduleStats: ModuleStat[];
      }>(`/api/v1/feature-requests${qs ? `?${qs}` : ''}`, { signal: controller.signal });

      setItems(prev => append ? [...prev, ...json.data] : json.data);
      setCursor(json.meta.cursor ?? undefined);
      setHasMore(json.meta.hasMore);
      setStats(json.stats);
      setModuleStats(json.moduleStats ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load feature requests');
    } finally {
      setIsLoading(false);
    }
  }, [filters, cursor]);

  useEffect(() => {
    setCursor(undefined);
    fetchData(false);
    return () => abortRef.current?.abort();
  }, [filters]); // fetchData is stable via useCallback

  const loadMore = useCallback(() => { if (hasMore) fetchData(true); }, [hasMore, fetchData]);
  const refresh = useCallback(() => { setCursor(undefined); fetchData(false); }, [fetchData]);

  const updateStatus = useCallback(async (ids: string[], status: string, adminNotes?: string) => {
    await adminFetch('/api/v1/feature-requests', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status, adminNotes }),
    });
    refresh();
  }, [refresh]);

  const updateOne = useCallback(async (id: string, updates: { status?: string; priority?: string; adminNotes?: string; tags?: string[] }) => {
    const json = await adminFetch<{ data: FeatureRequest; notificationQueued?: boolean }>(`/api/v1/feature-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setItems(prev => prev.map(item => item.id === id ? json.data : item));
    return json;
  }, []);

  const exportCsv = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.module) params.set('module', filters.module);
    if (filters.search) params.set('search', filters.search);
    const qs = params.toString();
    const url = `/api/v1/feature-requests/export${qs ? `?${qs}` : ''}`;
    const response = await fetch(url, { credentials: 'include' });
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `feature-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filters]);

  return {
    items, stats, moduleStats, isLoading, error, filters, setFilters,
    hasMore, loadMore, refresh, updateStatus, updateOne, exportCsv,
  };
}

// ── Detail hook ──────────────────────────────────────────────────

export function useFeatureRequestDetail(id: string | null) {
  const [data, setData] = useState<FeatureRequest | null>(null);
  const [similar, setSimilar] = useState<SimilarRequest[]>([]);
  const [submitterHistory, setSubmitterHistory] = useState<SubmitterHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setData(null); setSimilar([]); setSubmitterHistory([]); return; }
    setIsLoading(true);
    setError(null);
    adminFetch<{
      data: FeatureRequest;
      similar: SimilarRequest[];
      submitterHistory: SubmitterHistoryItem[];
    }>(`/api/v1/feature-requests/${id}`)
      .then(json => {
        setData(json.data);
        setSimilar(json.similar ?? []);
        setSubmitterHistory(json.submitterHistory ?? []);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const update = useCallback(async (updates: { status?: string; priority?: string; adminNotes?: string; tags?: string[] }) => {
    if (!id) return null;
    const json = await adminFetch<{ data: FeatureRequest; notificationQueued?: boolean }>(`/api/v1/feature-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setData(json.data);
    return json;
  }, [id]);

  return { data, similar, submitterHistory, isLoading, error, update };
}
