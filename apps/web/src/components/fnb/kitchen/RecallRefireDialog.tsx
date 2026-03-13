'use client';

import { useState } from 'react';
import { X, RotateCcw, RefreshCw } from 'lucide-react';

interface RecallRefireDialogProps {
  mode: 'recall' | 'refire';
  itemName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const RECALL_REASONS = [
  'Wrong item sent',
  'Quality issue',
  'Customer changed mind',
  'Missing modification',
  'Wrong cook temp',
  'Presentation issue',
];

const REFIRE_REASONS = [
  'Dropped/spilled',
  'Wrong temperature',
  'Customer complaint',
  'Sent to wrong table',
  'Quality issue',
  'Returned by server',
];

export function RecallRefireDialog({
  mode,
  itemName,
  onConfirm,
  onCancel,
}: RecallRefireDialogProps) {
  const [customReason, setCustomReason] = useState('');

  const isRecall = mode === 'recall';
  const reasons = isRecall ? RECALL_REASONS : REFIRE_REASONS;
  const accentColor = isRecall ? '#f97316' : '#ef4444';
  const accentBg = isRecall ? 'rgba(249, 115, 22, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  const Icon = isRecall ? RotateCcw : RefreshCw;
  const title = isRecall ? `Recall ${itemName}` : `Refire ${itemName}`;

  const handleCustomConfirm = () => {
    const trimmed = customReason.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          borderRadius: '0.75rem',
          width: '100%',
          maxWidth: '24rem',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            backgroundColor: 'var(--fnb-bg-elevated)',
            borderBottom: `1px solid ${accentColor}33`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Icon
              size={20}
              style={{ color: accentColor, flexShrink: 0 }}
            />
            <span
              style={{
                color: 'var(--fnb-text-primary)',
                fontWeight: 600,
                fontSize: '1rem',
                lineHeight: 1.25,
              }}
            >
              {title}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              color: 'var(--fnb-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.375rem',
            }}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <p
            style={{
              color: 'var(--fnb-text-muted)',
              fontSize: '0.8125rem',
              margin: 0,
            }}
          >
            Select reason to {mode} immediately:
          </p>

          {/* Reason grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
            }}
          >
            {reasons.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => onConfirm(reason)}
                style={{
                  minHeight: '3rem',
                  padding: '0.625rem 0.75rem',
                  backgroundColor: accentBg,
                  border: `1px solid ${accentColor}55`,
                  borderRadius: '0.5rem',
                  color: 'var(--fnb-text-primary)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'center',
                  lineHeight: 1.3,
                  transition: 'background-color 0.1s, border-color 0.1s, transform 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = isRecall
                    ? 'rgba(249, 115, 22, 0.28)'
                    : 'rgba(239, 68, 68, 0.28)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = accentBg;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${accentColor}55`;
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
                onTouchStart={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = isRecall
                    ? 'rgba(249, 115, 22, 0.35)'
                    : 'rgba(239, 68, 68, 0.35)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)';
                }}
                onTouchEnd={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = accentBg;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${accentColor}55`;
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
              >
                {reason}
              </button>
            ))}
          </div>

          {/* Custom reason */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label
              htmlFor="custom-reason"
              style={{
                color: 'var(--fnb-text-muted)',
                fontSize: '0.75rem',
              }}
            >
              Other reason (optional)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="custom-reason"
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomConfirm();
                }}
                maxLength={200}
                placeholder="Type a custom reason…"
                style={{
                  flex: 1,
                  minHeight: '2.75rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '0.5rem',
                  color: 'var(--fnb-text-primary)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleCustomConfirm}
                disabled={!customReason.trim()}
                style={{
                  minHeight: '2.75rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: customReason.trim() ? accentColor : 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: customReason.trim() ? '#fff' : 'var(--fnb-text-muted)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: customReason.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.1s',
                  whiteSpace: 'nowrap',
                }}
              >
                Send
              </button>
            </div>
          </div>

          {/* Cancel */}
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: '100%',
              minHeight: '2.75rem',
              padding: '0.625rem',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '0.5rem',
              color: 'var(--fnb-text-muted)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
