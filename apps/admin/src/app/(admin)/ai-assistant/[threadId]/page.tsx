'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, User, Bot, Settings, ThumbsUp, ThumbsDown, AlertTriangle } from 'lucide-react';
import { useAiSupportThread } from '@/hooks/use-ai-support';
import type { AiThreadMessage, AiContextSnapshot } from '@/hooks/use-ai-support';

// ── Helpers ───────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) return null;
  const map: Record<string, string> = {
    high: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[confidence] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
      {confidence} confidence
    </span>
  );
}

function RoleIcon({ role }: { role: string }) {
  if (role === 'user') return <User size={14} className="text-slate-400" />;
  if (role === 'assistant') return <Bot size={14} className="text-indigo-400" />;
  return <Settings size={14} className="text-slate-500" />;
}

function MessageBubble({
  message,
  snapshot,
}: {
  message: AiThreadMessage;
  snapshot?: AiContextSnapshot;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const _isSystem = message.role === 'system';

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <RoleIcon role={message.role} />
        <span className="capitalize">{message.role}</span>
        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
        {isAssistant && <ConfidenceBadge confidence={message.answerConfidence} />}
        {isAssistant && message.sourceTierUsed && (
          <span className="text-slate-500 text-xs">tier: {message.sourceTierUsed}</span>
        )}
      </div>

      <div
        className={`max-w-2xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600/20 border border-indigo-600/30 text-white'
            : isAssistant
            ? 'bg-slate-800 border border-slate-700 text-slate-100'
            : 'bg-slate-900 border border-slate-700 text-slate-400 italic text-xs'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.messageText}</p>
      </div>

      {/* Feedback */}
      {isAssistant && message.feedbackRating && (
        <div className="flex items-center gap-2 text-xs">
          {message.feedbackRating === 'thumbs_up' ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <ThumbsUp size={12} /> Helpful
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400">
              <ThumbsDown size={12} /> Not helpful
            </span>
          )}
          {message.feedbackReasonCode && (
            <span className="text-slate-500">· {message.feedbackReasonCode}</span>
          )}
          {message.feedbackComment && (
            <span className="text-slate-500">· "{message.feedbackComment}"</span>
          )}
        </div>
      )}

      {/* Context snapshot reference */}
      {snapshot && isUser && (
        <div className="text-xs text-slate-600">
          Context captured: {snapshot.route ?? 'unknown route'}
        </div>
      )}

      {/* Low confidence warning */}
      {isAssistant && message.answerConfidence === 'low' && (
        <div className="flex items-center gap-1 text-xs text-amber-400">
          <AlertTriangle size={12} />
          Low confidence — may need review
        </div>
      )}
    </div>
  );
}

function ContextPanel({ snapshots }: { snapshots: AiContextSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-8">
        No context snapshots captured
      </div>
    );
  }

  // Use first snapshot for primary context view
  const first = snapshots[0]!;
  const roleKeys = Array.isArray(first.roleKeysJson) ? (first.roleKeysJson as string[]) : [];
  const enabledModules = Array.isArray(first.enabledModulesJson)
    ? (first.enabledModulesJson as string[])
    : [];
  const featureFlags = first.featureFlagsJson && typeof first.featureFlagsJson === 'object'
    ? (first.featureFlagsJson as Record<string, boolean>)
    : {};
  const visibleActions = Array.isArray(first.visibleActionsJson)
    ? (first.visibleActionsJson as string[])
    : [];

  return (
    <div className="space-y-4">
      {/* Primary context */}
      <div className="space-y-2">
        <Row label="Route" value={first.route} />
        <Row label="Screen" value={first.screenTitle} />
        <Row label="Module" value={first.moduleKey} />
      </div>

      {roleKeys.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Roles</p>
          <div className="flex flex-wrap gap-1">
            {roleKeys.map((r) => (
              <span key={r} className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {enabledModules.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Enabled Modules</p>
          <div className="flex flex-wrap gap-1">
            {enabledModules.map((m) => (
              <span key={m} className="px-2 py-0.5 rounded-full text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-700/30">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {visibleActions.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Visible Actions</p>
          <div className="flex flex-wrap gap-1">
            {visibleActions.map((a) => (
              <span key={a} className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {Object.keys(featureFlags).length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Feature Flags</p>
          <div className="space-y-0.5">
            {Object.entries(featureFlags).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono">{k}</span>
                <span className={v ? 'text-emerald-400' : 'text-slate-500'}>{v ? 'on' : 'off'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {snapshots.length > 1 && (
        <p className="text-xs text-slate-600 border-t border-slate-800 pt-2 mt-2">
          {snapshots.length - 1} more snapshot{snapshots.length > 2 ? 's' : ''} in this thread
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-slate-500 w-16 shrink-0">{label}</span>
      <span className="text-slate-300 font-mono break-all">{value ?? '—'}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function AiThreadDetailPage() {
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const { detail, isLoading, error, load } = useAiSupportThread(params.threadId);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/ai-assistant')}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Inbox
        </button>
        <span className="text-slate-600">/</span>
        <span className="text-slate-300 text-sm font-mono">{params.threadId}</span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {isLoading && (
        <p className="text-center text-slate-500 text-sm py-12">Loading thread...</p>
      )}

      {detail && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Transcript */}
          <div className="lg:col-span-2 space-y-4">
            {/* Thread metadata */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 px-5 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <MetaItem label="Tenant" value={`${detail.thread.tenantName} (${detail.thread.tenantSlug})`} />
                <MetaItem label="User ID" value={detail.thread.userId} mono />
                <MetaItem label="Channel" value={detail.thread.channel} />
                <MetaItem label="Status" value={detail.thread.status} />
                <MetaItem label="Module" value={detail.thread.moduleKey} />
                <MetaItem label="Question Type" value={detail.thread.questionType} />
                <MetaItem label="Outcome" value={detail.thread.outcome} />
                <MetaItem label="Issue Tag" value={detail.thread.issueTag} />
                <MetaItem label="Started" value={detail.thread.startedAt ? new Date(detail.thread.startedAt).toLocaleString() : '—'} />
              </div>
            </div>

            {/* Messages */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-5">
              <h2 className="text-sm font-semibold text-white">
                Transcript ({detail.messages.length} messages)
              </h2>
              <div className="space-y-5">
                {detail.messages.map((msg) => {
                  const snapshot = detail.contextSnapshots.find((s) => s.messageId === msg.id);
                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      snapshot={snapshot}
                    />
                  );
                })}
                {detail.messages.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-6">No messages</p>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Context Snapshot</h2>
              <ContextPanel snapshots={detail.contextSnapshots} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-slate-500 text-xs">{label}</p>
      <p className={`text-white text-xs mt-0.5 ${mono ? 'font-mono' : ''} truncate`}>
        {value ?? '—'}
      </p>
    </div>
  );
}
