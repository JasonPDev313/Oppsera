'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';
import type {
  EntitlementItem,
  EntitlementSummary,
  AccessMode,
  ChangeLogEntry,
  ModuleTemplateItem,
  TemplateDiffItem,
  DependencyCheckResult,
} from '@/types/tenant';

// ── Module Manager ──────────────────────────────────────────────

interface ModuleManagerState {
  modules: EntitlementItem[];
  summary: EntitlementSummary | null;
  isLoading: boolean;
  error: string | null;
}

export function useModuleManager(tenantId: string) {
  const [state, setState] = useState<ModuleManagerState>({
    modules: [],
    summary: null,
    isLoading: false,
    error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await adminFetch<{
        data: { modules: EntitlementItem[]; summary: EntitlementSummary };
      }>(`/api/v1/tenants/${tenantId}/entitlements`);
      setState({ modules: res.data.modules, summary: res.data.summary, isLoading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, isLoading: false, error: e instanceof Error ? e.message : 'Failed to load modules' }));
    }
  }, [tenantId]);

  const changeMode = useCallback(
    async (moduleKey: string, accessMode: AccessMode, reason?: string, autoEnableDependencies?: boolean) => {
      await adminFetch(`/api/v1/tenants/${tenantId}/entitlements`, {
        method: 'POST',
        body: JSON.stringify({ moduleKey, accessMode, reason, autoEnableDependencies }),
      });
      await load();
    },
    [tenantId, load],
  );

  const validate = useCallback(
    async (moduleKey: string, accessMode: AccessMode): Promise<DependencyCheckResult> => {
      const res = await adminFetch<{ data: DependencyCheckResult }>(
        `/api/v1/tenants/${tenantId}/entitlements/validate`,
        { method: 'POST', body: JSON.stringify({ moduleKey, accessMode }) },
      );
      return res.data;
    },
    [tenantId],
  );

  const bulkChange = useCallback(
    async (changes: { moduleKey: string; accessMode: AccessMode }[], reason?: string, source?: string) => {
      await adminFetch(`/api/v1/tenants/${tenantId}/entitlements/bulk`, {
        method: 'POST',
        body: JSON.stringify({ changes, reason, source }),
      });
      await load();
    },
    [tenantId, load],
  );

  return { ...state, load, changeMode, validate, bulkChange };
}

// ── Change History ──────────────────────────────────────────────

export function useChangeHistory(tenantId: string) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = useCallback(
    async (moduleKey?: string) => {
      setIsLoading(true);
      try {
        const qs = new URLSearchParams();
        if (moduleKey) qs.set('moduleKey', moduleKey);
        const res = await adminFetch<{
          data: { items: ChangeLogEntry[]; cursor: string | null; hasMore: boolean };
        }>(`/api/v1/tenants/${tenantId}/entitlements/history?${qs}`);
        setEntries(res.data.items);
        setCursor(res.data.cursor);
        setHasMore(res.data.hasMore);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId],
  );

  return { entries, isLoading, hasMore, cursor, load };
}

// ── Module Templates ────────────────────────────────────────────

export function useModuleTemplates() {
  const [templates, setTemplates] = useState<ModuleTemplateItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch<{ data: ModuleTemplateItem[] }>('/api/v1/module-templates');
      setTemplates(res.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  const preview = useCallback(
    async (templateId: string, tenantId: string): Promise<{ changes: TemplateDiffItem[]; summary: Record<string, number> }> => {
      const res = await adminFetch<{
        data: { changes: TemplateDiffItem[]; summary: Record<string, number> };
      }>(`/api/v1/module-templates/${templateId}/preview`, {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      });
      return res.data;
    },
    [],
  );

  return { templates, isLoading, load, preview };
}
