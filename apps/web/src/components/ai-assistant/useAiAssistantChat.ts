'use client';

import { useState, useCallback, useRef } from 'react';
import { apiFetch, getStoredToken, attemptTokenRefresh } from '@/lib/api-client';
import { useAiAssistantContext } from './useAiAssistantContext';

interface Thread {
  id: string;
  status: string;
}

interface ActionStatus {
  name: string;
  status: 'executing' | 'complete' | 'error';
  result?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  messageText: string;
  answerConfidence?: string;
  sourceTierUsed?: string;
  suggestedFollowups?: string[];
  activeAction?: ActionStatus;
  createdAt: string;
}

export type { Thread, Message, ActionStatus };

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

      // Track the active response — may change if we auto-recover from a closed thread
      let activeRes = res;

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: { message: 'Failed to send message' } })) as {
          error?: { code?: string; message?: string };
        };
        const errorCode = errBody.error?.code;

        // Thread is closed or hit message cap — auto-reset and retry on a fresh thread
        if (errorCode === 'THREAD_CLOSED' || errorCode === 'MAX_MESSAGES_REACHED') {
          // Close the stale thread server-side
          if (currentThread) {
            void closeThreadOnServer(currentThread.id);
          }

          // Snapshot messages before createThread() clears state.
          // Use a state-getter pattern to capture the latest state.
          let previousMessages: Message[] = [];
          setMessages(prev => { previousMessages = prev; return prev; });

          // Create a fresh thread (this clears messages internally)
          const freshThread = await createThread();
          currentThread = freshThread;

          // Restore the full conversation history so the user doesn't lose context
          setMessages(previousMessages);

          const retryRes = await authStreamFetch(
            `/api/v1/ai-support/threads/${freshThread.id}/messages`,
            {
              threadId: freshThread.id,
              messageText: text,
              contextSnapshot: context,
            },
            controller.signal,
          );

          if (!retryRes.ok) {
            const retryBody = await retryRes.json().catch(() => ({ error: { message: 'Failed to send message' } })) as {
              error?: { message?: string };
            };
            throw new Error(retryBody.error?.message ?? 'Failed to send message');
          }

          activeRes = retryRes;
        } else {
          throw new Error(errBody.error?.message ?? 'Failed to send message');
        }
      }

      // Read real message IDs from response headers and replace temp placeholders
      const realUserMsgId = activeRes.headers.get('X-User-Message-Id');
      const realAssistantMsgId = activeRes.headers.get('X-Assistant-Message-Id');
      if (realUserMsgId || realAssistantMsgId) {
        setMessages(prev => prev.map(m => {
          if (realUserMsgId && m.id === userMsg.id) return { ...m, id: realUserMsgId };
          if (realAssistantMsgId && m.id === assistantMsg.id) return { ...m, id: realAssistantMsgId };
          return m;
        }));
      }

      const reader = activeRes.body?.getReader();
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
              name?: string;
              status?: string;
              result?: string;
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
            } else if (chunk.type === 'action') {
              // Agentic action status update
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    activeAction: {
                      name: chunk.name ?? '',
                      status: (chunk.status as 'executing' | 'complete' | 'error') ?? 'executing',
                      result: chunk.result,
                    },
                  };
                }
                return updated;
              });
            } else if (chunk.type === 'done') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  // Strip the inline follow-up section from the persisted message text.
                  // The rendering layer also strips in real-time (prevents flicker),
                  // but we clean the state too so stored text is tidy.
                  let cleanedText = last.messageText;
                  if (chunk.suggestedFollowups && chunk.suggestedFollowups.length > 0) {
                    const separatorIdx = cleanedText.lastIndexOf('\n---');
                    if (separatorIdx !== -1) {
                      const afterSep = cleanedText.slice(separatorIdx + 4);
                      const nonEmpty = afterSep.split('\n').filter(l => l.trim().length > 0);
                      const allBullets = nonEmpty.length > 0 &&
                        nonEmpty.every(l => /^[-*]\s+/.test(l.trim()) || /^\d+[.)]\s+/.test(l.trim()));
                      if (allBullets) {
                        cleanedText = cleanedText.slice(0, separatorIdx).trimEnd();
                      }
                    }
                  }
                  updated[updated.length - 1] = {
                    ...last,
                    messageText: cleanedText,
                    answerConfidence: chunk.confidence,
                    sourceTierUsed: chunk.sourceTier,
                    suggestedFollowups: chunk.suggestedFollowups,
                    activeAction: undefined,
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
  }, [thread, createThread, context, closeThreadOnServer]);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  /** Request escalation to a human agent. */
  const requestHandoff = useCallback(async (): Promise<boolean> => {
    if (!thread) return false;
    try {
      await apiFetch('/api/v1/ai-support/escalations', {
        method: 'POST',
        body: JSON.stringify({
          threadId: thread.id,
          reason: 'user_requested',
        }),
      });
      // Add a system message to the chat
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        role: 'system' as const,
        messageText: 'Your request has been escalated to a team member. They will follow up with you shortly.',
        createdAt: new Date().toISOString(),
      }]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request handoff');
      return false;
    }
  }, [thread]);

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

  return { thread, messages, isStreaming, error, sendMessage, stopStreaming, resetThread, requestHandoff, context };
}
