'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  Sparkles,
  Zap,
  Bug,
  ThumbsUp,
  Loader2,
  Map,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  businessImpact: string | null;
  requestType: string; // 'feature' | 'enhancement' | 'bug'
  module: string;
  status: string; // 'under_review' | 'planned' | 'in_progress'
  priority: string; // 'critical' | 'high' | 'medium' | 'low'
  voteCount: number;
  createdAt: string;
  voted: boolean;
}

type ColumnKey = 'under_review' | 'planned' | 'in_progress';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  accent: string;
  badgeBg: string;
  headerBorder: string;
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'under_review',
    label: 'Under Review',
    accent: 'text-blue-400',
    badgeBg: 'bg-blue-500/20 text-blue-400',
    headerBorder: 'border-blue-500/40',
  },
  {
    key: 'planned',
    label: 'Planned',
    accent: 'text-indigo-400',
    badgeBg: 'bg-indigo-500/20 text-indigo-400',
    headerBorder: 'border-indigo-500/40',
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    accent: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 text-emerald-400',
    headerBorder: 'border-emerald-500/40',
  },
];

// ── Helpers ─────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: typeof Sparkles; bg: string; text: string }> = {
  feature: { icon: Sparkles, bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
  enhancement: { icon: Zap, bg: 'bg-amber-500/20', text: 'text-amber-400' },
  bug: { icon: Bug, bg: 'bg-red-500/20', text: 'text-red-400' },
};

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; ring: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', ring: 'ring-red-500/30' },
  high: { bg: 'bg-amber-500/20', text: 'text-amber-400', ring: 'ring-amber-500/30' },
  medium: { bg: 'bg-blue-500/20', text: 'text-blue-400', ring: 'ring-blue-500/30' },
  low: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', ring: 'ring-emerald-500/30' },
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
}

// ── Component ───────────────────────────────────────────────────

export default function RoadmapContent() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());

  const fetchRoadmap = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: RoadmapItem[] }>('/api/v1/feature-requests/roadmap');
      setItems(res.data);
      setError(null);
    } catch {
      setError('Failed to load roadmap');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoadmap();
  }, [fetchRoadmap]);

  const handleVote = useCallback(async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (votingIds.has(itemId)) return;

    setVotingIds((prev) => new Set(prev).add(itemId));

    try {
      const res = await apiFetch<{ data: { voted: boolean; voteCount: number } }>(
        `/api/v1/feature-requests/${itemId}/vote`,
        { method: 'POST' },
      );

      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, voted: res.data.voted, voteCount: res.data.voteCount }
            : item,
        ),
      );
    } catch {
      // Silently fail — user can retry
    } finally {
      setVotingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }, [votingIds]);

  const toggleExpand = useCallback((itemId: string) => {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  }, []);

  // Group items by status
  const grouped: Record<ColumnKey, RoadmapItem[]> = {
    under_review: [],
    planned: [],
    in_progress: [],
  };
  for (const item of items) {
    const col = grouped[item.status as ColumnKey];
    if (col) col.push(item);
  }

  const totalCount = items.length;

  // ── Loading state ───────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-muted-foreground">{error}</p>
        <button
          onClick={fetchRoadmap}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────

  if (totalCount === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface py-20 gap-4">
          <div className="rounded-full bg-muted p-4">
            <Map className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">No items on the roadmap yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit feature requests to help shape the product!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main content ────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col gap-3">
            {/* Column header */}
            <div className={`flex items-center gap-2 border-b-2 pb-3 ${col.headerBorder}`}>
              <h2 className={`text-sm font-semibold uppercase tracking-wide ${col.accent}`}>
                {col.label}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${col.badgeBg}`}
              >
                {grouped[col.key].length}
              </span>
            </div>

            {/* Cards */}
            {grouped[col.key].length === 0 ? (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-12">
                <p className="text-sm text-muted-foreground">Nothing here yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {grouped[col.key].map((item) => (
                  <RoadmapCard
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    isVoting={votingIds.has(item.id)}
                    onToggle={() => toggleExpand(item.id)}
                    onVote={(e) => handleVote(e, item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page Header ─────────────────────────────────────────────────

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Product Roadmap</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Track upcoming features and improvements
      </p>
    </div>
  );
}

// ── Roadmap Card ────────────────────────────────────────────────

interface RoadmapCardProps {
  item: RoadmapItem;
  expanded: boolean;
  isVoting: boolean;
  onToggle: () => void;
  onVote: (e: React.MouseEvent) => void;
}

function RoadmapCard({ item, expanded, isVoting, onToggle, onVote }: RoadmapCardProps) {
  const typeConfig = TYPE_CONFIG[item.requestType] ?? TYPE_CONFIG.feature!;
  const priorityConfig = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.medium!;
  const TypeIcon = typeConfig.icon;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left bg-surface rounded-xl ring-1 ring-border p-4 transition-all cursor-pointer hover:ring-indigo-500/30 ${
        expanded ? 'ring-indigo-500/40' : ''
      }`}
    >
      {/* Type icon + title */}
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-1.5 ${typeConfig.bg} shrink-0`}>
          <TypeIcon className={`h-4 w-4 ${typeConfig.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">{item.title}</p>
        </div>
      </div>

      {/* Badges row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Module badge */}
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {item.module}
        </span>

        {/* Priority badge */}
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.ring}`}
        >
          {item.priority}
        </span>
      </div>

      {/* Description */}
      {!expanded && (
        <p className="mt-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {item.description}
        </p>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
          {item.businessImpact && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-medium text-foreground mb-1">Business Impact</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {item.businessImpact}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer: votes + time */}
      <div className="mt-3 flex items-center justify-between">
        <span
          role="button"
          tabIndex={0}
          onClick={onVote}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onVote(e as unknown as React.MouseEvent);
            }
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors ${
            item.voted
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          } ${isVoting ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <ThumbsUp className={`h-3 w-3 ${item.voted ? 'fill-current' : ''}`} />
          {item.voteCount}
        </span>

        <span className="text-xs text-muted-foreground">
          {relativeTime(item.createdAt)}
        </span>
      </div>
    </button>
  );
}
