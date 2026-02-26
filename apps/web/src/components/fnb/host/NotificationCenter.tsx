'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  CheckCheck,
  XCircle,
  RefreshCw,
  MessageSquare,
  Bell,
  Send,
} from 'lucide-react';

interface SentNotification {
  id: string;
  recipientName: string;
  recipientPhone: string;
  type: 'confirmation' | 'reminder' | 'table_ready' | 'custom';
  status: 'sent' | 'delivered' | 'failed';
  sentAt: string;
  message: string;
}

interface IncomingMessage {
  id: string;
  guestName: string;
  guestPhone: string;
  message: string;
  receivedAt: string;
  detectedAction: 'cancel' | 'late' | 'none';
  handled: boolean;
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  notifications: SentNotification[];
  incoming: IncomingMessage[];
  onRetry?: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  confirmation: 'Confirmation',
  reminder: 'Reminder',
  table_ready: 'Table Ready',
  custom: 'Custom',
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  confirmation: { bg: 'rgba(59, 130, 246, 0.1)', text: 'var(--fnb-info)' },
  reminder: { bg: 'rgba(245, 158, 11, 0.1)', text: 'var(--fnb-warning)' },
  table_ready: { bg: 'rgba(34, 197, 94, 0.1)', text: 'var(--fnb-status-available)' },
  custom: { bg: 'var(--fnb-bg-elevated)', text: 'var(--fnb-text-secondary)' },
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'delivered') return <CheckCheck size={12} style={{ color: 'var(--fnb-status-available)' }} />;
  if (status === 'sent') return <Check size={12} style={{ color: 'var(--fnb-text-muted)' }} />;
  return <XCircle size={12} style={{ color: 'var(--fnb-danger)' }} />;
}

function ActionBadge({ action }: { action: string }) {
  if (action === 'cancel') {
    return (
      <span
        className="text-[9px] font-bold uppercase rounded px-1.5 py-0.5"
        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--fnb-danger)' }}
      >
        Auto-cancelled
      </span>
    );
  }
  if (action === 'late') {
    return (
      <span
        className="text-[9px] font-bold uppercase rounded px-1.5 py-0.5"
        style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--fnb-warning)' }}
      >
        Running late
      </span>
    );
  }
  return null;
}

export function NotificationCenter({
  open,
  onClose,
  notifications,
  incoming,
  onRetry,
}: NotificationCenterProps) {
  const [tab, setTab] = useState<'sent' | 'incoming'>('sent');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-80 h-full flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Bell size={14} style={{ color: 'var(--fnb-text-primary)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              Notifications
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md transition-all"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 px-3 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => setTab('sent')}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all"
            style={{
              backgroundColor: tab === 'sent' ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: tab === 'sent' ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
            }}
          >
            <Send size={11} />
            Sent
            {notifications.length > 0 && (
              <span
                className="text-[9px] font-bold tabular-nums rounded px-1.5 py-0.5"
                style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}
              >
                {notifications.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('incoming')}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all"
            style={{
              backgroundColor: tab === 'incoming' ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: tab === 'incoming' ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
            }}
          >
            <MessageSquare size={11} />
            Incoming
            {incoming.filter((m) => !m.handled).length > 0 && (
              <span
                className="text-[9px] font-bold tabular-nums rounded-full px-1.5 py-0.5"
                style={{ backgroundColor: 'var(--fnb-danger)', color: '#fff' }}
              >
                {incoming.filter((m) => !m.handled).length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {tab === 'sent' && (
            <div className="space-y-1.5">
              {notifications.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--fnb-text-muted)' }}>
                  No notifications sent yet
                </p>
              ) : (
                notifications.map((n) => {
                  const typeStyle = TYPE_COLORS[n.type] ?? TYPE_COLORS.custom ?? { bg: '#e5e7eb', text: '#374151' };
                  return (
                    <div
                      key={n.id}
                      className="rounded-lg px-3 py-2.5"
                      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                          {n.recipientName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={n.status} />
                          <span className="text-[9px]" style={{ color: 'var(--fnb-text-muted)' }}>
                            {new Date(n.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[9px] font-bold uppercase rounded px-1.5 py-0.5"
                          style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
                        >
                          {TYPE_LABELS[n.type] ?? n.type}
                        </span>
                        {n.status === 'failed' && onRetry && (
                          <button
                            type="button"
                            onClick={() => onRetry(n.id)}
                            className="flex items-center gap-0.5 text-[9px] font-semibold rounded px-1.5 py-0.5"
                            style={{ color: 'var(--fnb-danger)' }}
                          >
                            <RefreshCw size={9} />
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'incoming' && (
            <div className="space-y-1.5">
              {incoming.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--fnb-text-muted)' }}>
                  No incoming messages
                </p>
              ) : (
                incoming.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg px-3 py-2.5"
                    style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                        {m.guestName}
                      </span>
                      <span className="text-[9px]" style={{ color: 'var(--fnb-text-muted)' }}>
                        {new Date(m.receivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] mb-1.5" style={{ color: 'var(--fnb-text-secondary)' }}>
                      {m.message}
                    </p>
                    <div className="flex items-center gap-2">
                      <ActionBadge action={m.detectedAction} />
                      <span className="text-[9px]" style={{ color: 'var(--fnb-text-muted)' }}>
                        {m.guestPhone}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
