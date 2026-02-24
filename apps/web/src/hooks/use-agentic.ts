'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface AnalysisStep {
  stepNumber: number;
  type: 'hypothesis' | 'query' | 'analysis' | 'conclusion' | 'follow_up';
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string | null;
  sql?: string | null;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  durationMs?: number;
}

export interface AgenticResult {
  question: string;
  steps: AnalysisStep[];
  finalAnswer: string;
  confidence: number;
  totalDurationMs: number;
  metricsUsed: string[];
  tablesAccessed: string[];
  suggestedFollowUps: string[];
}

export interface AgenticInput {
  question: string;
  maxSteps?: number;
  sessionId?: string;
}

interface AgenticApiResponse {
  data: AgenticResult;
}

const AGENTIC_TIMEOUT_MS = 120_000; // 2 minutes — agentic analysis is multi-step

// ── Hook ───────────────────────────────────────────────────────────

export function useAgenticAnalysis() {
  const [result, setResult] = useState<AgenticResult | null>(null);
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  const investigate = useCallback(async (input: AgenticInput): Promise<AgenticResult | null> => {
    // Abort any previous in-flight request
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSteps([]);

    // Build placeholder steps for progressive feel
    const maxSteps = input.maxSteps ?? 5;
    const placeholderSteps: AnalysisStep[] = Array.from({ length: maxSteps }, (_, i) => ({
      stepNumber: i + 1,
      type: 'analysis' as const,
      title: i === 0 ? 'Formulating hypothesis' : `Analysis step ${i + 1}`,
      description: 'Pending...',
      status: i === 0 ? 'running' as const : 'pending' as const,
    }));
    setSteps(placeholderSteps);

    const timeout = setTimeout(() => {
      controller.abort();
    }, AGENTIC_TIMEOUT_MS);

    try {
      const res = await apiFetch<AgenticApiResponse>('/api/v1/semantic/agentic', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify(input),
      });

      setResult(res.data);
      setSteps(res.data.steps);
      return res.data;
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) {
        // Distinguish user-initiated cancel from timeout
        const isTimeout = !abortControllerRef.current;
        const msg = isTimeout
          ? 'Analysis timed out. The investigation took too long. Try a more specific question.'
          : 'Analysis cancelled.';
        setError(msg);
        return null;
      }

      const msg = err instanceof Error ? err.message : 'Failed to run agentic analysis';
      setError(msg);
      return null;
    } finally {
      clearTimeout(timeout);
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return { result, steps, investigate, cancel, isLoading, error };
}
