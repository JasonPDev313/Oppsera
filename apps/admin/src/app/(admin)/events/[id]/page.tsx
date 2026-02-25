'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RotateCcw,
  CheckCircle,
  XCircle,
  Trash2,
  ChevronDown,
  ChevronRight,
  Copy,
} from 'lucide-react';
import { useDeadLetterDetail, useDeadLetterActions } from '@/hooks/use-dead-letters';
import { adminFetch } from '@/lib/api-fetch';

interface RetryHistoryItem {
  id: string;
  retryNumber: number;
  retriedBy: string;
  adminName: string | null;
  retryResult: string;
  errorMessage: string | null;
  retriedAt: string;
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-700/50 transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="px-4 pb-4 border-t border-slate-700">{children}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    failed: 'bg-red-500/10 text-red-400 border-red-500/30',
    retrying: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    discarded: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium border ${colors[status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
      {status}
    </span>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { entry, isLoading, error, refresh } = useDeadLetterDetail(id);
  const { retry, resolve, discard, isActing } = useDeadLetterActions();
  const [retryHistory, setRetryHistory] = useState<RetryHistoryItem[]>([]);
  const [resolveDialog, setResolveDialog] = useState<'resolve' | 'discard' | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [copied, setCopied] = useState(false);

  const loadRetryHistory = useCallback(async () => {
    try {
      const res = await adminFetch<{ data: RetryHistoryItem[] }>(`/api/v1/events/${id}/retry-history`);
      setRetryHistory(res.data);
    } catch {
      // silent
    }
  }, [id]);

  useEffect(() => { loadRetryHistory(); }, [loadRetryHistory]);

  const handleRetry = async () => {
    const ok = await retry(id);
    if (ok) { refresh(); loadRetryHistory(); }
  };

  const handleResolveSubmit = async () => {
    if (!resolveDialog) return;
    const ok = resolveDialog === 'resolve'
      ? await resolve(id, resolveNotes)
      : await discard(id, resolveNotes);
    if (ok) {
      setResolveDialog(null);
      setResolveNotes('');
      refresh();
    }
  };

  const copyPayload = () => {
    if (entry?.eventData) {
      navigator.clipboard.writeText(JSON.stringify(entry.eventData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading && !entry) {
    return <p className="text-slate-500 text-sm p-6">Loading...</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm p-6">{error}</p>;
  }
  if (!entry) {
    return <p className="text-slate-500 text-sm p-6">Event not found</p>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        Back to Events
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white font-mono">{entry.eventType}</h1>
            <StatusBadge status={entry.status} />
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1">{entry.id}</p>
        </div>

        {entry.status === 'failed' && (
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
            >
              <RotateCcw size={14} />
              Retry
            </button>
            <button
              onClick={() => setResolveDialog('resolve')}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <CheckCircle size={14} />
              Resolve
            </button>
            <button
              onClick={() => setResolveDialog('discard')}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 size={14} />
              Discard
            </button>
          </div>
        )}
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Event ID', value: entry.eventId },
          { label: 'Consumer', value: entry.consumerName },
          { label: 'Attempts', value: `${entry.attemptCount}/${entry.maxRetries}` },
          { label: 'Tenant', value: entry.tenantId ?? '—' },
          { label: 'First Failed', value: new Date(entry.firstFailedAt).toLocaleString() },
          { label: 'Last Failed', value: new Date(entry.lastFailedAt).toLocaleString() },
          { label: 'Created', value: new Date(entry.createdAt).toLocaleString() },
          { label: 'Resolved At', value: entry.resolvedAt ? new Date(entry.resolvedAt).toLocaleString() : '—' },
        ].map(item => (
          <div key={item.label} className="bg-slate-800 rounded-lg border border-slate-700 px-3 py-2.5">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{item.label}</p>
            <p className="text-sm text-slate-200 font-mono mt-0.5 truncate">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Resolution notes */}
      {entry.resolutionNotes && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs text-emerald-400 font-medium mb-1">Resolution Notes</p>
          <p className="text-sm text-slate-300">{entry.resolutionNotes}</p>
          {entry.resolvedBy && <p className="text-xs text-slate-500 mt-1">By: {entry.resolvedBy}</p>}
        </div>
      )}

      {/* Collapsible sections */}
      <div className="space-y-3">
        <CollapsibleSection title="Error Message" defaultOpen>
          <p className="text-sm text-red-400 font-mono whitespace-pre-wrap mt-2">
            {entry.errorMessage ?? 'No error message'}
          </p>
        </CollapsibleSection>

        <CollapsibleSection title="Stack Trace">
          <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap overflow-x-auto mt-2 max-h-[400px] overflow-y-auto">
            {entry.errorStack ?? 'No stack trace'}
          </pre>
        </CollapsibleSection>

        <CollapsibleSection title="Event Payload">
          <div className="relative mt-2">
            <button
              onClick={copyPayload}
              className="absolute top-2 right-2 p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
              title="Copy payload"
            >
              <Copy size={12} />
            </button>
            {copied && (
              <span className="absolute top-2 right-10 text-xs text-emerald-400">Copied!</span>
            )}
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-[500px] overflow-y-auto bg-slate-900 rounded p-3">
              {JSON.stringify(entry.eventData, null, 2)}
            </pre>
          </div>
        </CollapsibleSection>

        {/* Retry History */}
        {retryHistory.length > 0 && (
          <CollapsibleSection title={`Retry History (${retryHistory.length})`} defaultOpen>
            <div className="space-y-2 mt-3">
              {retryHistory.map(item => (
                <div key={item.id} className="flex items-start gap-3 text-sm">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.retryResult === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300">Retry #{item.retryNumber}</span>
                      <span className={`text-xs font-medium ${item.retryResult === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.retryResult}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {item.adminName ?? item.retriedBy} · {new Date(item.retriedAt).toLocaleString()}
                    </p>
                    {item.errorMessage && (
                      <p className="text-xs text-red-400/80 mt-0.5 font-mono">{item.errorMessage}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Resolve/Discard Dialog */}
      {resolveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
              {resolveDialog === 'resolve' ? (
                <><CheckCircle size={18} className="text-emerald-400" /> Resolve Event</>
              ) : (
                <><XCircle size={18} className="text-red-400" /> Discard Event</>
              )}
            </h3>
            <textarea
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="Notes (optional)..."
              rows={3}
              className="w-full bg-slate-900 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 placeholder:text-slate-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setResolveDialog(null); setResolveNotes(''); }} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button
                onClick={handleResolveSubmit}
                disabled={isActing}
                className={`px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors ${resolveDialog === 'resolve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
              >
                {isActing ? 'Processing...' : resolveDialog === 'resolve' ? 'Resolve' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
