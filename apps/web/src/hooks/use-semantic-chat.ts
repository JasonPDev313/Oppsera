'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

const REQUEST_TIMEOUT_MS = 45_000; // 45s — covers 2 LLM calls + DB execution

// ── Types ─────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;          // user's question OR assistant's narrative
  // Assistant-only fields
  evalTurnId?: string | null;  // ULID of the eval turn — used for feedback submission
  plan?: QueryPlan | null;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  isClarification?: boolean;
  compiledSql?: string | null;
  compilationErrors?: string[];
  llmConfidence?: number | null;
  llmLatencyMs?: number;
  cacheStatus?: 'HIT' | 'MISS' | 'SKIP';
  error?: string | null;
  timestamp: number;
}

export interface QueryPlan {
  metrics: string[];
  dimensions: string[];
  filters: unknown[];
  dateRange: { start: string; end: string } | null;
  intent?: string;
  timeGranularity?: string | null;
  sort?: { metricSlug: string; direction: 'asc' | 'desc' }[];
  limit?: number | null;
}

// ── Hook ──────────────────────────────────────────────────────────

interface UseSemanticChatOptions {
  sessionId?: string;
  lensSlug?: string;
  timezone?: string;
}

export function useSemanticChat(options: UseSemanticChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable session ID for multi-turn context
  const sessionIdRef = useRef<string>(
    options.sessionId ?? `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  const turnNumberRef = useRef(1);
  const abortControllerRef = useRef<AbortController | null>(null);
  const wasTimedOutRef = useRef(false);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    wasTimedOutRef.current = false;

    // Timeout: abort if the request takes too long
    const timeout = setTimeout(() => {
      wasTimedOutRef.current = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: message.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    // Build conversation history for multi-turn context (last 10 turns)
    const history = messages
      .slice(-10)
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.error))
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'user' ? m.content : (m.content || ''),
      }));

    try {
      const res = await apiFetch<{
        data: {
          narrative: string | null;
          sections: Array<{ type: string; content: string }>;
          plan: QueryPlan | null;
          rows: Record<string, unknown>[];
          rowCount: number;
          isClarification: boolean;
          clarificationText: string | null;
          evalTurnId: string | null;
          compiledSql: string | null;
          compilationErrors: string[];
          llmConfidence: number | null;
          llmLatencyMs: number;
          cacheStatus: 'HIT' | 'MISS' | 'SKIP';
        };
      }>('/api/v1/semantic/ask', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          message: message.trim(),
          sessionId: sessionIdRef.current,
          turnNumber: turnNumberRef.current++,
          history,
          lensSlug: options.lensSlug,
          timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const { data } = res;
      let assistantContent: string;
      if (data.isClarification) {
        assistantContent = data.clarificationText ?? 'Could you clarify your question?';
      } else if (data.narrative) {
        assistantContent = data.narrative;
      } else if (data.compilationErrors?.length > 0) {
        assistantContent = `I wasn't able to process that query. ${data.compilationErrors[0]}`;
      } else {
        assistantContent = "I couldn't generate a response for that question. Try rephrasing or asking about specific metrics like revenue, rounds played, or utilization.";
      }

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        evalTurnId: data.evalTurnId ?? null,
        plan: data.plan,
        rows: data.rows,
        rowCount: data.rowCount,
        isClarification: data.isClarification,
        compiledSql: data.compiledSql,
        compilationErrors: data.compilationErrors,
        llmConfidence: data.llmConfidence,
        llmLatencyMs: data.llmLatencyMs,
        cacheStatus: data.cacheStatus,
        error: null,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const isTimeout = isAbort && wasTimedOutRef.current;

      // User-initiated cancel (not timeout) — don't show error message
      if (isAbort && !isTimeout) {
        return;
      }

      const errorText = isTimeout
        ? 'Request timed out. The AI took too long to respond — please try a simpler question.'
        : err instanceof Error ? err.message : 'Failed to get a response';
      setError(errorText);

      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: isTimeout
          ? 'This is taking too long. Try asking a simpler question, or try again in a moment.'
          : 'Sorry, something went wrong. Please try again.',
        error: errorText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      clearTimeout(timeout);
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [messages, isLoading, options.lensSlug, options.timezone]);

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setError(null);
    setIsLoading(false);
    turnNumberRef.current = 1;
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    cancelRequest,
    clearMessages,
    sessionId: sessionIdRef.current,
  };
}
