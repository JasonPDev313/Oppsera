'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  User,
  Building2,
  ShieldAlert,
  Settings,
  Zap,
} from 'lucide-react';
import { SnapshotDiffViewer } from './SnapshotDiffViewer';
import type { PlatformAuditEntry } from '@/hooks/use-audit';

const ACTION_ICONS: Record<string, typeof User> = {
  tenant: Building2,
  user: User,
  staff: User,
  customer: User,
  impersonation: ShieldAlert,
  entitlement: Settings,
  feature_flag: Settings,
  role: ShieldAlert,
};

function getActionIcon(entityType: string) {
  return ACTION_ICONS[entityType] ?? Zap;
}

function formatAction(action: string): string {
  return action.replace(/\./g, ' \u203a ');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface AuditLogEntryProps {
  entry: PlatformAuditEntry;
}

export function AuditLogEntry({ entry }: AuditLogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getActionIcon(entry.entityType);
  const hasDiff = entry.beforeSnapshot || entry.afterSnapshot;
  const changedCount = hasDiff
    ? countChanges(entry.beforeSnapshot, entry.afterSnapshot)
    : 0;

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-accent transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-1.5 rounded bg-slate-800">
            <Icon size={14} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                {entry.actorAdminName ?? entry.actorAdminEmail ?? 'Unknown'}
              </span>
              <span className="text-xs text-muted-foreground">&middot;</span>
              <span className="text-xs font-mono text-indigo-400">
                {formatAction(entry.action)}
              </span>
              {changedCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  {changedCount} changed
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">
                Entity: <span className="text-foreground">{entry.entityType}</span>{' '}
                {entry.tenantName && (
                  <>in <span className="text-foreground">{entry.tenantName}</span></>
                )}
              </span>
            </div>
            {entry.reason && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Reason: &ldquo;{entry.reason}&rdquo;
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(entry.createdAt)}
            </span>
            {hasDiff && (
              expanded
                ? <ChevronDown size={14} className="text-muted-foreground" />
                : <ChevronRight size={14} className="text-muted-foreground" />
            )}
          </div>
        </div>
        {entry.ipAddress && (
          <div className="ml-10 mt-1">
            <span className="text-[10px] text-muted-foreground">
              IP: {entry.ipAddress}
            </span>
          </div>
        )}
      </button>

      {expanded && hasDiff && (
        <div className="px-4 pb-3 ml-10">
          <SnapshotDiffViewer
            before={entry.beforeSnapshot}
            after={entry.afterSnapshot}
          />
        </div>
      )}
    </div>
  );
}

function countChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): number {
  if (!before && !after) return 0;
  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  let count = 0;
  for (const key of allKeys) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) count++;
  }
  return count;
}
