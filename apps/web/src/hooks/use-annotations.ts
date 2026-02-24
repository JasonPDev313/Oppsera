'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface Annotation {
  id: string;
  metricSlug: string | null;
  date: string;
  endDate: string | null;
  title: string;
  description: string | null;
  category: AnnotationCategory;
  impact: 'positive' | 'negative' | 'neutral' | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnnotationCategory =
  | 'event'
  | 'promotion'
  | 'incident'
  | 'holiday'
  | 'staffing'
  | 'weather'
  | 'competition'
  | 'other';

export interface AddAnnotationInput {
  metricSlug?: string | null;
  date: string;
  endDate?: string | null;
  title: string;
  description?: string | null;
  category: AnnotationCategory;
  impact?: 'positive' | 'negative' | 'neutral' | null;
}

export interface UpdateAnnotationInput {
  title?: string;
  description?: string | null;
  category?: AnnotationCategory;
  impact?: 'positive' | 'negative' | 'neutral' | null;
  date?: string;
  endDate?: string | null;
}

interface AnnotationsListResponse {
  data: Annotation[];
}

interface AnnotationResponse {
  data: Annotation;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useAnnotations(metricSlug?: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ── Fetch annotations ──
  const fetchAnnotations = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = metricSlug ? `?metricSlug=${encodeURIComponent(metricSlug)}` : '';
      const res = await apiFetch<AnnotationsListResponse>(
        `/api/v1/semantic/annotations${params}`,
      );
      if (!mountedRef.current) return;
      setAnnotations(res.data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load annotations');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [metricSlug]);

  // ── Auto-load on mount and when metricSlug changes ──
  useEffect(() => {
    mountedRef.current = true;
    fetchAnnotations();
    return () => { mountedRef.current = false; };
  }, [fetchAnnotations]);

  // ── Add annotation ──
  const add = useCallback(async (input: AddAnnotationInput): Promise<Annotation | null> => {
    try {
      const res = await apiFetch<AnnotationResponse>('/api/v1/semantic/annotations', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setAnnotations((prev) => [...prev, res.data]);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add annotation';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Update annotation ──
  const update = useCallback(async (id: string, updates: UpdateAnnotationInput): Promise<Annotation | null> => {
    try {
      const res = await apiFetch<AnnotationResponse>(`/api/v1/semantic/annotations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? res.data : a)),
      );
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update annotation';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Remove annotation ──
  const remove = useCallback(async (id: string): Promise<void> => {
    // Optimistic removal
    setAnnotations((prev) => prev.filter((a) => a.id !== id));

    try {
      await apiFetch(`/api/v1/semantic/annotations/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove annotation';
      setError(msg);
      fetchAnnotations();
      throw err;
    }
  }, [fetchAnnotations]);

  return { annotations, add, update, remove, isLoading, error, refresh: fetchAnnotations };
}
