'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, Edit3, AlertCircle, Check, X } from 'lucide-react';

interface NotificationComposerProps {
  open: boolean;
  onClose: () => void;
  recipientName: string;
  recipientPhone: string;
  templateMessage: string;
  onSend: (message: string) => Promise<void>;
  smsConfigured: boolean;
}

export function NotificationComposer({
  open,
  onClose,
  recipientName,
  recipientPhone,
  templateMessage,
  onSend,
  smsConfigured,
}: NotificationComposerProps) {
  const [message, setMessage] = useState(templateMessage);
  const [isCustom, setIsCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      await onSend(message);
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  }, [message, onSend, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <h2 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Send Notification
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {!smsConfigured ? (
          /* SMS not configured */
          <div className="px-5 py-6 text-center">
            <AlertCircle size={24} className="mx-auto mb-3" style={{ color: 'var(--fnb-warning)' }} />
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>
              SMS Not Configured
            </p>
            <p className="text-[11px] mb-4" style={{ color: 'var(--fnb-text-muted)' }}>
              Set up an SMS provider in Settings to send notifications.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-semibold rounded-lg px-4 py-2"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-secondary)',
              }}
            >
              Close
            </button>
          </div>
        ) : sent ? (
          /* Success state */
          <div className="px-5 py-6 text-center">
            <div
              className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
            >
              <Check size={20} style={{ color: 'var(--fnb-status-available)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
              Notification Sent!
            </p>
          </div>
        ) : (
          /* Compose */
          <div className="px-5 py-4 space-y-3">
            {/* Recipient */}
            <div
              className="rounded-lg px-3 py-2"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
                To
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                {recipientName}
              </span>
              <span className="text-[11px] ml-2" style={{ color: 'var(--fnb-text-muted)' }}>
                {recipientPhone}
              </span>
            </div>

            {/* Message */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--fnb-text-muted)' }}>
                  Message
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustom(!isCustom);
                    if (isCustom) setMessage(templateMessage);
                  }}
                  className="flex items-center gap-1 text-[10px] font-semibold"
                  style={{ color: 'var(--fnb-info)' }}
                >
                  <Edit3 size={10} />
                  {isCustom ? 'Use Template' : 'Edit'}
                </button>
              </div>
              {isCustom ? (
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-xs resize-none"
                  style={{
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                    border: '1px solid color-mix(in srgb, var(--fnb-info) 30%, transparent)',
                  }}
                />
              ) : (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-secondary)',
                  }}
                >
                  {message}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--fnb-danger) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--fnb-danger) 20%, transparent)',
                }}
              >
                <AlertCircle size={12} style={{ color: 'var(--fnb-danger)' }} />
                <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
                  {error}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95"
                style={{
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  color: 'var(--fnb-text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--fnb-info)',
                  color: '#fff',
                }}
              >
                <Send size={12} />
                {sending ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
