'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  Monitor,
  Filter,
  RefreshCw,
  AlertTriangle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useCommunicationTimeline,
  useMessageMutations,
} from '@/hooks/use-customer-360';
import type { CommunicationEntry } from '@/types/customer-360';

// ── Helpers ──────────────────────────────────────────────────────

function formatDateTime(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

const CHANNEL_LABELS: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  email: { label: 'Email', icon: Mail, color: 'info' },
  sms: { label: 'SMS', icon: Phone, color: 'success' },
  internal_note: { label: 'Internal', icon: MessageSquare, color: 'warning' },
  chat: { label: 'Chat', icon: Monitor, color: 'neutral' },
  statement: { label: 'Statement', icon: Mail, color: 'neutral' },
};

const CHANNEL_OPTIONS = [
  { value: '', label: 'All Channels' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'internal_note', label: 'Internal Note' },
  { value: 'chat', label: 'Chat' },
  { value: 'statement', label: 'Statement' },
];

// ── Communication Entry Component ───────────────────────────────

function CommunicationItem({ entry }: { entry: CommunicationEntry }) {
  const channelInfo = CHANNEL_LABELS[entry.channel] ?? {
    label: entry.channel,
    icon: MessageSquare,
    color: 'neutral',
  };
  const ChannelIcon = channelInfo.icon;
  const isInbound = entry.direction === 'inbound';
  const DirectionIcon = isInbound ? ArrowDownLeft : ArrowUpRight;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-input">
      <div className="flex items-start gap-3">
        {/* Channel icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <ChannelIcon className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={channelInfo.color}>{channelInfo.label}</Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DirectionIcon className="h-3 w-3" />
                {isInbound ? 'Inbound' : 'Outbound'}
              </div>
            </div>
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title={entry.sentAt ? formatDateTime(entry.sentAt) : formatDateTime(entry.createdAt)}
            >
              {formatRelativeTime(entry.sentAt ?? entry.createdAt)}
            </span>
          </div>

          {entry.subject && (
            <p className="mt-1 text-sm font-medium text-foreground">{entry.subject}</p>
          )}

          {entry.body && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{entry.body}</p>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant={entry.status === 'sent' ? 'success' : entry.status === 'failed' ? 'error' : 'neutral'}>
              {entry.status}
            </Badge>
            {entry.createdBy && <span>by {entry.createdBy}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compose Form ────────────────────────────────────────────────

function ComposeForm({
  customerId,
  onSent,
}: {
  customerId: string;
  onSent: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [channel, setChannel] = useState('internal_note');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { sendMessage, isLoading } = useMessageMutations();

  const handleSend = async () => {
    if (!body.trim()) return;
    try {
      await sendMessage(customerId, {
        channel,
        subject: subject.trim() || undefined,
        body: body.trim(),
      });
      setSubject('');
      setBody('');
      setIsOpen(false);
      onSent();
    } catch {
      // Error handled in hook
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-surface px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-indigo-500/30 hover:text-indigo-600"
      >
        <Send className="h-4 w-4" />
        Compose Message
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">New Message</h4>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-muted-foreground hover:text-muted-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-3">
        {/* Channel selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="internal_note">Internal Note</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="chat">Chat</option>
          </select>
        </div>

        {/* Subject (optional) */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject (optional)</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter subject..."
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Body */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={4}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSend}
            disabled={!body.trim() || isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function CommunicationTab({ customerId }: { customerId: string }) {
  const [channelFilter, setChannelFilter] = useState('');
  const { data, isLoading, error, mutate } = useCommunicationTimeline(
    customerId,
    channelFilter ? { channel: channelFilter } : undefined,
  );

  return (
    <div className="space-y-4 p-6">
      {/* Header + Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Communications
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="rounded-md border border-input bg-surface px-2 py-1 text-xs text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Compose Form */}
      <ComposeForm customerId={customerId} onSent={mutate} />

      {/* Timeline */}
      {isLoading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
          <p className="mb-4 text-sm text-muted-foreground">Failed to load communications.</p>
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {(data?.items ?? []).map((entry) => (
              <CommunicationItem key={entry.id} entry={entry} />
            ))}
            {(data?.items ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No communications recorded yet
              </p>
            )}
          </div>

          {data?.hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => mutate()}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <ChevronDown className="h-4 w-4" />
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
