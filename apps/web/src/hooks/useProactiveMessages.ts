'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface ProactiveMessage {
  id: string;
  messageTemplate: string;
  triggerType: string;
  moduleKey: string | null;
  priority: number;
}

export function useProactiveMessages(route: string, moduleKey?: string) {
  const [messages, setMessages] = useState<ProactiveMessage[]>([]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ route });
      if (moduleKey) params.set('moduleKey', moduleKey);
      const res = await apiFetch<{ data: ProactiveMessage[] }>(
        `/api/v1/ai-support/proactive?${params}`,
      );
      setMessages(res.data);
    } catch {
      // Non-critical — silently ignore
    }
  }, [route, moduleKey]);

  useEffect(() => {
    void load();
    // Re-check every 60s so newly-enabled rules surface without a page refresh
    const interval = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const dismiss = useCallback(async (ruleId: string) => {
    // Optimistic removal
    setMessages((prev) => prev.filter((m) => m.id !== ruleId));
    try {
      await apiFetch('/api/v1/ai-support/proactive', {
        method: 'POST',
        body: JSON.stringify({ ruleId }),
      });
    } catch {
      // Best effort — do not re-show on failure; the server will re-surface
      // on next load if the dismissal didn't persist.
    }
  }, []);

  return { messages, dismiss };
}
