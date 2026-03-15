'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

interface StationMessage {
  id: string;
  fromStation: string;
  message: string;
  timestamp: number;
}

interface StationMessagesProps {
  stationName: string;
  messages: StationMessage[];
  onDismiss?: (messageId: string) => void;
}

interface StationMessageToggleProps {
  isOpen: boolean;
  onClick: () => void;
  onToggle?: () => void;
  unreadCount?: number;
}

interface StationMessagePanelProps {
  stationName: string;
  isOpen: boolean;
  onSendMessage?: (message: string) => void;
  onClose: () => void;
}

const QUICK_MESSAGES = [
  'Hold fire',
  'Ready to plate',
  'Need refire',
  'Behind on items',
  '86\'d — check item',
  'Allergy confirmed',
  'Rush order incoming',
  'Table waiting',
];

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  return `${diffMin}m ago`;
}

export function StationMessages({ stationName: _stationName, messages, onDismiss }: StationMessagesProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [timeKeys, setTimeKeys] = useState(0);

  // Re-render timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeKeys(k => k + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-dismiss messages after 30 seconds
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const msg of messages) {
      if (!dismissed.has(msg.id)) {
        const elapsed = Date.now() - msg.timestamp;
        const remaining = Math.max(0, 30000 - elapsed);
        const timer = setTimeout(() => {
          setDismissed(prev => new Set(prev).add(msg.id));
          onDismiss?.(msg.id);
        }, remaining);
        timers.push(timer);
      }
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [messages, dismissed, onDismiss]);

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => new Set(prev).add(id));
    onDismiss?.(id);
  }, [onDismiss]);

  const visible = messages.filter(m => !dismissed.has(m.id));

  if (visible.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px',
      }}
      // timeKeys consumed to re-render timestamps
      data-time-key={timeKeys}
    >
      {visible.map(msg => (
        <div
          key={msg.id}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          <MessageSquare
            size={14}
            style={{ color: 'rgb(245, 158, 11)', flexShrink: 0, marginTop: '2px' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '2px',
              }}
            >
              <span
                style={{
                  fontSize: 'calc(11px * var(--pos-font-scale, 1))',
                  fontWeight: 600,
                  color: 'rgb(245, 158, 11)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {msg.fromStation}
              </span>
              <span
                style={{
                  fontSize: 'calc(10px * var(--pos-font-scale, 1))',
                  color: 'var(--fnb-text-muted)',
                }}
              >
                {formatTimeAgo(msg.timestamp)}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 'calc(13px * var(--pos-font-scale, 1))',
                color: 'var(--fnb-text-primary)',
                lineHeight: '1.4',
              }}
            >
              {msg.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDismiss(msg.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: 'var(--fnb-text-muted)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
            }}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function StationMessageToggle({ isOpen, onClick, onToggle, unreadCount = 0 }: StationMessageToggleProps) {
  const handleClick = onClick ?? onToggle ?? (() => {});
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={handleClick}
        title={isOpen ? 'Close message panel' : 'Open message panel'}
        aria-label={isOpen ? 'Close message panel' : 'Open message panel'}
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '6px',
          border: `1px solid ${isOpen ? 'rgba(245, 158, 11, 0.5)' : 'rgba(255,255,255,0.12)'}`,
          background: isOpen ? 'rgba(245, 158, 11, 0.15)' : 'var(--fnb-bg-elevated)',
          color: isOpen ? 'rgb(245, 158, 11)' : 'var(--fnb-text-secondary)',
          cursor: 'pointer',
          fontSize: 'calc(12px * var(--pos-font-scale, 1))',
          fontWeight: 500,
          transition: 'all 0.15s ease',
        }}
      >
        <MessageSquare size={15} />
        <span>Messages</span>
      </button>
      {unreadCount > 0 && (
        <span
          aria-label={`${unreadCount} unread messages`}
          style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            background: 'rgb(245, 158, 11)',
            color: '#000',
            fontSize: 'calc(10px * var(--pos-font-scale, 1))',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}

export function StationMessagePanel({ stationName, isOpen, onSendMessage, onClose }: StationMessagePanelProps) {
  const [customMessage, setCustomMessage] = useState('');

  const handleQuickSend = useCallback((msg: string) => {
    onSendMessage?.(msg);
  }, [onSendMessage]);

  const handleCustomSend = useCallback(() => {
    const trimmed = customMessage.trim();
    if (!trimmed) return;
    onSendMessage?.(trimmed);
    setCustomMessage('');
  }, [customMessage, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCustomSend();
    }
  }, [handleCustomSend]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        background: 'var(--fnb-bg-surface)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 'calc(11px * var(--pos-font-scale, 1))',
            fontWeight: 600,
            color: 'var(--fnb-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Send from {stationName}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close message panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'var(--fnb-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Quick message buttons */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        {QUICK_MESSAGES.map(msg => (
          <button
            key={msg}
            type="button"
            onClick={() => handleQuickSend(msg)}
            style={{
              padding: '8px 14px',
              minHeight: '44px',
              borderRadius: '5px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
              fontSize: 'calc(12px * var(--pos-font-scale, 1))',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease, transform 0.1s',
              transform: 'scale(1)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245, 158, 11, 0.15)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245, 158, 11, 0.4)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgb(245, 158, 11)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--fnb-bg-elevated)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--fnb-text-secondary)';
            }}
            onTouchStart={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245, 158, 11, 0.15)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245, 158, 11, 0.4)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgb(245, 158, 11)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)';
            }}
            onTouchEnd={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--fnb-bg-elevated)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--fnb-text-secondary)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
          >
            {msg}
          </button>
        ))}
      </div>

      {/* Custom message input */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={customMessage}
          onChange={e => setCustomMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Custom message…"
          maxLength={120}
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: '5px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-primary)',
            fontSize: 'calc(13px * var(--pos-font-scale, 1))',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={handleCustomSend}
          disabled={!customMessage.trim()}
          aria-label="Send custom message"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 10px',
            borderRadius: '5px',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            background: customMessage.trim() ? 'rgba(245, 158, 11, 0.2)' : 'var(--fnb-bg-elevated)',
            color: customMessage.trim() ? 'rgb(245, 158, 11)' : 'var(--fnb-text-muted)',
            cursor: customMessage.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.12s ease',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
