'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

const REQUEST_TIMEOUT_MS = 90_000; // 90s — covers 3 LLM calls (intent + SQL gen + narrative) + DB execution

// ── Types ─────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;          // user's question OR assistant's narrative
  // Assistant-only fields
  evalTurnId?: string | null;  // ULID of the eval turn — used for feedback submission
  mode?: 'metrics' | 'sql';   // pipeline mode used for this response
  plan?: QueryPlan | null;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  isClarification?: boolean;
  compiledSql?: string | null;
  compilationErrors?: string[];
  llmConfidence?: number | null;
  llmLatencyMs?: number;
  cacheStatus?: 'HIT' | 'MISS' | 'SKIP';
  sqlExplanation?: string | null;
  tablesAccessed?: string[];
  // Proactive intelligence
  suggestedFollowUps?: string[];
  chartConfig?: ChartConfigData | null;
  // Data quality assessment
  dataQuality?: DataQualityData | null;
  error?: string | null;
  timestamp: number;
}

export interface DataQualityData {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  factors: Array<{ name: string; score: number; weight: number; detail: string }>;
  summary: string;
}

export interface ChartConfigData {
  type: 'line' | 'bar' | 'sparkline' | 'table' | 'metric_card' | 'comparison';
  xAxis?: string;
  yAxis?: string[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  yFormat?: 'currency' | 'number' | 'percent';
  comparisonLabel?: string;
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

/** Subset of eval turn fields returned by the session detail API */
export interface LoadedTurn {
  id: string;
  turnNumber: number;
  userMessage: string;
  narrative: string | null;
  llmPlan: Record<string, unknown> | null;
  compiledSql: string | null;
  compilationErrors: string[] | null;
  resultSample: Record<string, unknown>[] | null;
  rowCount: number | null;
  cacheStatus: 'HIT' | 'MISS' | 'SKIP' | null;
  llmConfidence: number | null;
  llmLatencyMs: number | null;
  wasClarification: boolean;
  clarificationMessage: string | null;
  userRating: number | null;
  userThumbsUp: boolean | null;
  evalTurnId: string;
  createdAt: string;
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
          mode: 'metrics' | 'sql';
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
          sqlExplanation: string | null;
          tablesAccessed: string[];
          suggestedFollowUps: string[];
          chartConfig: ChartConfigData | null;
          dataQuality: DataQualityData | null;
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
        mode: data.mode,
        plan: data.plan,
        rows: data.rows,
        rowCount: data.rowCount,
        isClarification: data.isClarification,
        compiledSql: data.compiledSql,
        compilationErrors: data.compilationErrors,
        llmConfidence: data.llmConfidence,
        llmLatencyMs: data.llmLatencyMs,
        cacheStatus: data.cacheStatus,
        sqlExplanation: data.sqlExplanation,
        tablesAccessed: data.tablesAccessed ?? [],
        suggestedFollowUps: data.suggestedFollowUps ?? [],
        chartConfig: data.chartConfig ?? null,
        dataQuality: data.dataQuality ?? null,
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

  /** Load a previous session's turns into chat state so the user can continue the conversation. */
  const initFromSession = useCallback((dbSessionId: string, turns: LoadedTurn[]) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    sessionIdRef.current = dbSessionId;
    turnNumberRef.current = turns.length + 1;

    const mapped = turns.flatMap(evalTurnToChatMessages);
    setMessages(mapped);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    cancelRequest,
    clearMessages,
    initFromSession,
    sessionId: sessionIdRef.current,
  };
}

// ── Helper: convert DB eval turn → pair of ChatMessages ──────────

function evalTurnToChatMessages(turn: LoadedTurn): ChatMessage[] {
  const userMsg: ChatMessage = {
    id: `user_loaded_${turn.id}`,
    role: 'user',
    content: turn.userMessage,
    timestamp: new Date(turn.createdAt).getTime(),
  };

  let assistantContent: string;
  if (turn.wasClarification) {
    assistantContent = turn.clarificationMessage ?? 'Could you clarify your question?';
  } else if (turn.narrative) {
    assistantContent = turn.narrative;
  } else if (turn.compilationErrors && turn.compilationErrors.length > 0) {
    assistantContent = `I wasn't able to process that query. ${turn.compilationErrors[0]}`;
  } else {
    assistantContent = "I couldn't generate a response for that question. Try rephrasing or asking about specific metrics like revenue, orders, or items sold.";
  }

  const assistantMsg: ChatMessage = {
    id: `asst_loaded_${turn.id}`,
    role: 'assistant',
    content: assistantContent,
    evalTurnId: turn.evalTurnId,
    plan: turn.llmPlan as QueryPlan | null,
    rows: (turn.resultSample as Record<string, unknown>[]) ?? undefined,
    rowCount: turn.rowCount ?? undefined,
    isClarification: turn.wasClarification,
    compiledSql: turn.compiledSql,
    compilationErrors: turn.compilationErrors ?? undefined,
    llmConfidence: turn.llmConfidence,
    llmLatencyMs: turn.llmLatencyMs ?? undefined,
    cacheStatus: turn.cacheStatus ?? undefined,
    error: null,
    timestamp: new Date(turn.createdAt).getTime(),
  };

  return [userMsg, assistantMsg];
}
