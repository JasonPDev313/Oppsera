'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Backup, BackupStats, BackupSettings, RestoreOperation } from '@/types/backup';

async function adminFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Backup List ──────────────────────────────────────────────────

interface BackupListFilters {
  status?: string;
  type?: string;
}

export function useBackups(filters: BackupListFilters = {}) {
  const [items, setItems] = useState<Backup[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursorVal?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.type) params.set('type', filters.type);
      if (cursorVal) params.set('cursor', cursorVal);
      params.set('limit', '50');

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch(`/api/v1/admin/backups${qs}`);
      if (cursorVal) {
        setItems((prev) => [...prev, ...json.data]);
      } else {
        setItems(json.data);
      }
      setCursor(json.meta?.cursor ?? null);
      setHasMore(json.meta?.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setIsLoading(false);
    }
  }, [filters.status, filters.type]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (cursor && hasMore) fetchPage(cursor);
  }, [cursor, hasMore, fetchPage]);

  const refresh = useCallback(() => {
    setCursor(null);
    fetchPage();
  }, [fetchPage]);

  return { items, isLoading, error, hasMore, loadMore, refresh };
}

// ── Backup Stats ─────────────────────────────────────────────────

export function useBackupStats() {
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const json = await adminFetch('/api/v1/admin/backups/stats');
      setStats(json.data);
    } catch {
      // silently fail stats
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, isLoading, refresh: fetchStats };
}

// ── Backup Detail ────────────────────────────────────────────────

export function useBackupDetail(id: string) {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch(`/api/v1/admin/backups/${id}`);
      setBackup(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backup');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  return { backup, isLoading, error, refresh: fetchDetail };
}

// ── Backup Actions ───────────────────────────────────────────────

export function useBackupActions() {
  const [isActing, setIsActing] = useState(false);

  const createBackup = useCallback(async (label?: string) => {
    setIsActing(true);
    try {
      const json = await adminFetch('/api/v1/admin/backups', {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
      return json.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const deleteBackup = useCallback(async (id: string) => {
    setIsActing(true);
    try {
      await adminFetch(`/api/v1/admin/backups/${id}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    } finally {
      setIsActing(false);
    }
  }, []);

  const requestRestore = useCallback(async (backupId: string, confirmationPhrase: string) => {
    setIsActing(true);
    try {
      const json = await adminFetch('/api/v1/admin/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ backupId, confirmationPhrase }),
      });
      return json.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const runRetention = useCallback(async () => {
    setIsActing(true);
    try {
      const json = await adminFetch('/api/v1/admin/backups/retention', { method: 'POST' });
      return json.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { createBackup, deleteBackup, requestRestore, runRetention, isActing };
}

// ── Backup Settings ──────────────────────────────────────────────

export function useBackupSettings() {
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch('/api/v1/admin/backups/settings');
      setSettings(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateSettings = useCallback(async (updates: Partial<BackupSettings>) => {
    try {
      const json = await adminFetch('/api/v1/admin/backups/settings', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setSettings(json.data);
      return json.data;
    } catch (err) {
      throw err;
    }
  }, []);

  return { settings, isLoading, error, refresh: fetchSettings, updateSettings };
}

// ── Restore Operations ───────────────────────────────────────────

interface RestoreListFilters {
  status?: string;
}

export function useRestoreOperations(filters: RestoreListFilters = {}) {
  const [items, setItems] = useState<RestoreOperation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (cursorVal?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (cursorVal) params.set('cursor', cursorVal);
      params.set('limit', '50');

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch(`/api/v1/admin/backups/restores${qs}`);
      if (cursorVal) {
        setItems((prev) => [...prev, ...json.data]);
      } else {
        setItems(json.data);
      }
      setCursor(json.meta?.cursor ?? null);
      setHasMore(json.meta?.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load restore operations');
    } finally {
      setIsLoading(false);
    }
  }, [filters.status]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (cursor && hasMore) fetchPage(cursor);
  }, [cursor, hasMore, fetchPage]);

  const refresh = useCallback(() => {
    setCursor(null);
    fetchPage();
  }, [fetchPage]);

  return { items, isLoading, error, hasMore, loadMore, refresh };
}

export function useRestoreActions() {
  const [isActing, setIsActing] = useState(false);

  const approve = useCallback(async (id: string) => {
    setIsActing(true);
    try {
      const json = await adminFetch(`/api/v1/admin/backups/restores/${id}/approve`, {
        method: 'POST',
      });
      return json.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const reject = useCallback(async (id: string, reason: string) => {
    setIsActing(true);
    try {
      const json = await adminFetch(`/api/v1/admin/backups/restores/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      return json.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  return { approve, reject, isActing };
}
