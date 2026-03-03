'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Clock,
  Zap,
} from 'lucide-react';
import type { ImpersonationSessionItem } from '@/hooks/use-audit';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const mins = Math.round((e - s) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/30',
  ended: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  expired: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  pending: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

interface ImpersonationSessionCardProps {
  item: ImpersonationSessionItem;
}

export function ImpersonationSessionCard({ item }: ImpersonationSessionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { session, actionsDuringSession } = item;

  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-accent transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-1.5 rounded bg-slate-800">
            <ShieldAlert size={14} className="text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                {session.adminName}
              </span>
              <span className="text-muted-foreground">&rarr;</span>
              <span className="text-sm text-foreground">
                {session.targetUserName ?? session.targetUserEmail ?? 'Unknown User'}
              </span>
              <span className="text-xs text-muted-foreground">
                ({session.tenantName})
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={11} />
                {formatDate(session.startedAt)}
                {session.endedAt && (
                  <> &ndash; {formatTime(session.endedAt)} ({getDuration(session.startedAt, session.endedAt)})</>
                )}
              </span>
              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${STATUS_STYLES[session.status] ?? STATUS_STYLES.pending}`}>
                {session.status}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Zap size={11} /> {session.actionCount} actions
              </span>
            </div>
            {session.reason && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Reason: &ldquo;{session.reason}&rdquo;
              </p>
            )}
          </div>
          <div className="shrink-0">
            {expanded
              ? <ChevronDown size={14} className="text-muted-foreground" />
              : <ChevronRight size={14} className="text-muted-foreground" />
            }
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 ml-10">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Actions during session:
          </h4>
          {actionsDuringSession.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No recorded actions</p>
          ) : (
            <div className="space-y-1.5">
              {actionsDuringSession.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-16 shrink-0">
                    {formatTime(a.createdAt)}
                  </span>
                  <span className="font-mono text-indigo-400">
                    {a.action}
                  </span>
                  <span className="text-muted-foreground">
                    {a.entityType} {a.entityId?.slice(0, 8)}...
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
