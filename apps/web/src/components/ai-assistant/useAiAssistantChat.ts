'use client';

import { useState, useCallback, useRef } from 'react';
import { apiFetch, getStoredToken, attemptTokenRefresh } from '@/lib/api-client';
import { useAiAssistantContext } from './useAiAssistantContext';

interface Thread {
  id: string;
  status: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  messageText: string;
  answerConfidence?: string;
  sourceTierUsed?: string;
  suggestedFollowups?: string[];
  createdAt: string;
}

export type { Thread, Message };

/**
 * Auth-aware streaming fetch: attaches Bearer token, and on 401 refreshes
 * the token then retries once — mirroring apiFetch's refresh logic.
 */
async function authStreamFetch(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const doFetch = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getStoredToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  };

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      res = await doFetch();
    }
  }

  return res;
}

export function useAiAssistantChat() {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = useAiAssistantContext();
  const abortRef = useRef<AbortController | null>(null);

  /** Close a thread on the server (fire-and-forget, best effort). */
  const closeThreadOnServer = useCallback(async (threadId: string) => {
    try {
      await apiFetch(`/api/v1/ai-support/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' }),
      });
    } catch (err) {
      // Best effort — don't block the UI, but log for observability
      console.warn('[ai-assistant] Failed to close thread', threadId, err);
    }
  }, []);

  const createThread = useCallback(async () => {
    const result = await apiFetch<{ data: Thread }>('/api/v1/ai-support/threads', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'in_app',
        currentRoute: context.route,
        moduleKey: context.moduleKey,
      }),
    });
    const t = result.data;
    setThread(t);
    setMessages([]);
    return t;
  }, [context.route, context.moduleKey]);

  const sendMessage = useCallback(async (text: string) => {
    setError(null);

    let currentThread = thread;
    if (!currentThread) {
      try {
        currentThread = await createThread();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to start conversation';
        setError(msg);
        return;
      }
    }

    // Add user message optimistically
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      messageText: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Add placeholder assistant message
    const assistantMsg: Message = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      messageText: '',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    // Client-side timeout (65s) — slightly above Vercel's 60s maxDuration
    // so server-side timeout fires first under normal conditions
    const streamTimeout = setTimeout(() => controller.abort(), 65_000);

    try {

      const res = await authStreamFetch(
        `/api/v1/ai-support/threads/${currentThread.id}/messages`,
        {
          threadId: currentThread.id,
          messageText: text,
          contextSnapshot: context,
        },
        controller.signal,
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: { message: 'Failed to send message' } }));
        throw new Error((errBody as { error?: { message?: string } }).error?.message ?? 'Failed to send message');
      }

      // Read real message IDs from response headers and replace temp placeholders
      const realUserMsgId = res.headers.get('X-User-Message-Id');
      const realAssistantMsgId = res.headers.get('X-Assistant-Message-Id');
      if (realUserMsgId || realAssistantMsgId) {
        setMessages(prev => prev.map(m => {
          if (realUserMsgId && m.id === userMsg.id) return { ...m, id: realUserMsgId };
          if (realAssistantMsgId && m.id === assistantMsg.id) return { ...m, id: realAssistantMsgId };
          return m;
        }));
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const chunk = JSON.parse(jsonStr) as {
              type: string;
              text?: string;
              confidence?: string;
              sourceTier?: string;
              suggestedFollowups?: string[];
              message?: string;
            };

            if (chunk.type === 'chunk') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    messageText: last.messageText + (chunk.text ?? ''),
                  };
                }
                return updated;
              });
            } else if (chunk.type === 'done') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    answerConfidence: chunk.confidence,
                    sourceTierUsed: chunk.sourceTier,
                    suggestedFollowups: chunk.suggestedFollowups,
                  };
                }
                return updated;
              });
            } else if (chunk.type === 'error') {
              setError(chunk.message ?? 'An error occurred');
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setError(e.message);
      }
    } finally {
      clearTimeout(streamTimeout);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [thread, createThread, context]);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  /** Close the current thread on the server and reset local state. */
  const resetThread = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    // Close the server-side thread so it doesn't count against the open-thread cap
    if (thread) {
      void closeThreadOnServer(thread.id);
    }
    setThread(null);
    setMessages([]);
    setError(null);
  }, [thread, closeThreadOnServer]);

  return { thread, messages, isStreaming, error, sendMessage, stopStreaming, resetThread, context };
}
