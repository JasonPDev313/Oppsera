'use client';

import { useMemo } from 'react';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { useAllImportHistory } from '@/hooks/use-all-import-history';
import {
  getEnabledImportTypes,
  getTypeLabels,
  CATEGORY_LABELS,
} from '@/lib/import-registry';
import type { ImportTypeConfig } from '@/lib/import-registry';
import type { ImportLogEntry } from '@/types/import-dashboard';

interface ImportTypeWithLastImport extends ImportTypeConfig {
  lastImport: { status: string; date: string; records: number } | null;
}

interface GroupedImportTypes {
  category: string;
  categoryLabel: string;
  types: ImportTypeWithLastImport[];
}

export function useImportDashboard() {
  const { isModuleEnabled } = useEntitlementsContext();
  const { items: historyItems, isLoading, error, refresh } = useAllImportHistory();

  const typeLabels = useMemo(() => getTypeLabels(), []);

  const enabledTypes = useMemo(
    () => getEnabledImportTypes(isModuleEnabled),
    [isModuleEnabled],
  );

  // Build a map: module key → most recent import
  const lastImportByType = useMemo(() => {
    const map: Record<string, { status: string; date: string; records: number }> = {};
    for (const item of historyItems) {
      const key = item.module;
      if (!map[key]) {
        map[key] = {
          status: item.status,
          date: item.startedAt,
          records: item.totalRows,
        };
      }
    }
    return map;
  }, [historyItems]);

  // Enrich types with last import info
  const typesWithLastImport: ImportTypeWithLastImport[] = useMemo(
    () =>
      enabledTypes.map((t) => ({
        ...t,
        lastImport: lastImportByType[t.key] ?? null,
      })),
    [enabledTypes, lastImportByType],
  );

  // Group by category
  const grouped: GroupedImportTypes[] = useMemo(() => {
    const categoryMap = new Map<string, ImportTypeWithLastImport[]>();
    for (const t of typesWithLastImport) {
      const list = categoryMap.get(t.category) ?? [];
      list.push(t);
      categoryMap.set(t.category, list);
    }
    return Array.from(categoryMap.entries()).map(([category, types]) => ({
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? category,
      types,
    }));
  }, [typesWithLastImport]);

  // Normalize history items into ImportLogEntry[] for the table
  const recentImports: ImportLogEntry[] = useMemo(
    () =>
      historyItems.slice(0, 20).map((item) => ({
        id: item.id,
        importType: item.module,
        fileName: item.fileName,
        status: normalizeStatus(item.status),
        totalRows: item.totalRows,
        successRows: item.successRows,
        errorRows: item.errorRows,
        createdAt: item.startedAt,
        completedAt: item.completedAt ?? undefined,
      })),
    [historyItems],
  );

  return {
    grouped,
    recentImports,
    typeLabels,
    isLoading,
    error,
    refresh,
  };
}

function normalizeStatus(
  status: string,
): 'pending' | 'processing' | 'completed' | 'failed' | 'partial' {
  switch (status) {
    case 'completed':
    case 'done':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    case 'partial':
    case 'partial_success':
      return 'partial';
    case 'processing':
    case 'running':
    case 'importing':
      return 'processing';
    default:
      return 'pending';
  }
}
