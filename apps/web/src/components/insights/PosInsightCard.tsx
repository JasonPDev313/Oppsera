'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

interface InsightFeedResponse {
  data: {
    insights: Array<{
      id: string;
      message: string;
      type: string;
      createdAt: string;
    }>;
  };
}

interface PosInsightCardProps {
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Component ──────────────────────────────────────────────────────

export function PosInsightCard({ className }: PosInsightCardProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInsight = useCallback(async () => {
    try {
      const res = await apiFetch<InsightFeedResponse>(
        '/api/v1/semantic/feed',
      );
      if (!mountedRef.current) return;

      const insights = res.data?.insights;
      if (insights && insights.length > 0) {
        setInsight(insights[0]!.message);
      } else {
        setInsight(null);
      }
    } catch {
      // Errors are non-fatal — show nothing
      if (mountedRef.current) {
        setInsight(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchInsight();

    timerRef.current = setInterval(fetchInsight, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [fetchInsight]);

  // Show nothing while loading, if dismissed, or if no insight available
  if (!loaded || dismissed || !insight) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 flex items-center gap-2 text-sm ${className ?? ''}`}
    >
      <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" />

      <p className="flex-1 min-w-0 text-foreground line-clamp-2 leading-snug">
        {insight}
      </p>

      <Link
        href="/insights"
        className="shrink-0 flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors whitespace-nowrap"
      >
        Ask AI
        <ArrowRight className="h-3 w-3" />
      </Link>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        aria-label="Dismiss insight"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
