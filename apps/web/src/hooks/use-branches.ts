'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface ConversationBranch {
  id: string;
  parentSessionId: string;
  parentTurnNumber: number;
  branchSessionId: string;
  label: string | null;
  createdAt: string;
}

export interface CreateBranchInput {
  parentSessionId: string;
  parentTurnNumber: number;
  label?: string;
}

interface BranchesListResponse {
  data: ConversationBranch[];
}

interface BranchResponse {
  data: ConversationBranch;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useBranches(parentSessionId?: string) {
  const [branches, setBranches] = useState<ConversationBranch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ── Fetch branches for a session ──
  const loadBranches = useCallback(async (sessionId?: string) => {
    const targetSessionId = sessionId ?? parentSessionId;
    if (!targetSessionId) return;

    setIsLoading(true);
    try {
      const res = await apiFetch<BranchesListResponse>(
        `/api/v1/semantic/branches?sessionId=${encodeURIComponent(targetSessionId)}`,
      );
      if (!mountedRef.current) return;
      setBranches(res.data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [parentSessionId]);

  // ── Auto-load on mount and when parentSessionId changes ──
  useEffect(() => {
    mountedRef.current = true;
    if (parentSessionId) {
      loadBranches();
    }
    return () => { mountedRef.current = false; };
  }, [loadBranches, parentSessionId]);

  // ── Create a new branch ──
  const createBranch = useCallback(async (
    sessionId: string,
    parentTurnNumber: number,
    label?: string,
  ): Promise<ConversationBranch | null> => {
    try {
      const res = await apiFetch<BranchResponse>('/api/v1/semantic/branches', {
        method: 'POST',
        body: JSON.stringify({
          parentSessionId: sessionId,
          parentTurnNumber,
          label: label ?? undefined,
        }),
      });
      setBranches((prev) => [...prev, res.data]);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create branch';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Delete a branch ──
  const deleteBranch = useCallback(async (id: string): Promise<void> => {
    // Optimistic removal
    setBranches((prev) => prev.filter((b) => b.id !== id));

    try {
      await apiFetch(`/api/v1/semantic/branches/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete branch';
      setError(msg);
      loadBranches();
      throw err;
    }
  }, [loadBranches]);

  return { branches, createBranch, deleteBranch, isLoading, error, refresh: loadBranches };
}
