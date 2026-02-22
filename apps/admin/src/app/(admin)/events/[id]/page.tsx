'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  RotateCcw,
  CheckCircle,
  Trash2,
  Clock,
  AlertTriangle,
  Hash,
  Server,
} from 'lucide-react';
import { useDeadLetterDetail, useDeadLetterActions } from '@/hooks/use-dead-letters';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    failed: 'bg-red-100 text-red-700',
    retrying: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700',
    discarded: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start gap-4 py-2">
      <span className="text-xs font-medium text-slate-500 w-32 shrink-0">{label}</span>
      <span className={`text-sm text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '-'}
      </span>
    </div>
  );
}

export default function DeadLetterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { entry, isLoading, error, refresh } = useDeadLetterDetail(id);
  const { retry, resolve, discard, isActing } = useDeadLetterActions();

  const handleRetry = async () => {
    const ok = await retry(id);
    if (ok) refresh();
  };

  const handleResolve = async () => {
    const ok = await resolve(id, 'Manually resolved via admin panel');
    if (ok) refresh();
  };

  const handleDiscard = async () => {
    const ok = await discard(id, 'Discarded via admin panel');
    if (ok) refresh();
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-700 rounded" />
          <div className="h-64 bg-slate-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="p-6">
        <Link href="/events" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mb-4">
          <ArrowLeft size={14} /> Back to Events
        </Link>
        <div className="text-center py-12">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-500 mb-3" />
          <p className="text-slate-300">{error ?? 'Dead letter not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px]">
      <Link href="/events" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to Events
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100 font-mono">{entry.eventType}</h1>
          <p className="text-sm text-slate-400 mt-1">Event ID: {entry.eventId}</p>
        </div>
        {entry.status === 'failed' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetry}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
            >
              <RotateCcw size={14} /> Retry
            </button>
            <button
              onClick={handleResolve}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-500 transition-colors"
            >
              <CheckCircle size={14} /> Resolve
            </button>
            <button
              onClick={handleDiscard}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 transition-colors"
            >
              <Trash2 size={14} /> Discard
            </button>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
          <Hash size={14} /> Metadata
        </h2>
        <InfoRow label="Status" value={entry.status} />
        <InfoRow label="Consumer" value={entry.consumerName} mono />
        <InfoRow label="Tenant ID" value={entry.tenantId} mono />
        <InfoRow label="Attempts" value={`${entry.attemptCount} / ${entry.maxRetries}`} />
        <InfoRow label="First Failed" value={new Date(entry.firstFailedAt).toLocaleString()} />
        <InfoRow label="Last Failed" value={new Date(entry.lastFailedAt).toLocaleString()} />
        {entry.resolvedAt && (
          <>
            <InfoRow label="Resolved At" value={new Date(entry.resolvedAt).toLocaleString()} />
            <InfoRow label="Resolved By" value={entry.resolvedBy} mono />
            <InfoRow label="Resolution Notes" value={entry.resolutionNotes} />
          </>
        )}
      </div>

      {/* Error */}
      {entry.errorMessage && (
        <div className="bg-slate-800 rounded-lg border border-red-900/30 p-4 mb-4">
          <h2 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
            <AlertTriangle size={14} /> Error
          </h2>
          <p className="text-sm text-red-300 font-medium mb-2">{entry.errorMessage}</p>
          {entry.errorStack && (
            <pre className="text-xs text-slate-400 bg-slate-900 rounded-lg p-3 overflow-auto max-h-48 font-mono whitespace-pre-wrap">
              {entry.errorStack}
            </pre>
          )}
        </div>
      )}

      {/* Event Payload */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
          <Server size={14} /> Event Payload
        </h2>
        <pre className="text-xs text-slate-300 bg-slate-900 rounded-lg p-3 overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
          {JSON.stringify(entry.eventData, null, 2)}
        </pre>
      </div>
    </div>
  );
}
