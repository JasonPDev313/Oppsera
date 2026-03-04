'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, Star } from 'lucide-react';
import type { WaitlistEntry } from '@/hooks/use-fnb-host';

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

interface EditGuestDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (changes: {
    guestName: string;
    guestPhone?: string;
    partySize: number;
    quotedWaitMinutes?: number;
    seatingPreference?: string;
    specialRequests?: string;
    isVip?: boolean;
    notes?: string;
  }) => Promise<void>;
  entry: WaitlistEntry;
  isSubmitting: boolean;
  error?: string | null;
}

const SEATING_OPTIONS = ['Any', 'Booth', 'Bar', 'Patio', 'High Top', 'Window'];

export function EditGuestDialog({
  open,
  onClose,
  onSubmit,
  entry,
  isSubmitting,
  error,
}: EditGuestDialogProps) {
  const [guestName, setGuestName] = useState(entry.guestName);
  const [guestPhone, setGuestPhone] = useState(entry.guestPhone ?? '');
  const [partySize, setPartySize] = useState(entry.partySize);
  const [quotedWaitMinutes, setQuotedWaitMinutes] = useState(
    entry.quotedWaitMinutes != null ? String(entry.quotedWaitMinutes) : '',
  );
  const [seatingPreference, setSeatingPreference] = useState(
    entry.seatingPreference ?? 'Any',
  );
  const [specialRequests, setSpecialRequests] = useState(entry.specialRequests ?? '');
  const [isVip, setIsVip] = useState(entry.isVip);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  // Re-sync when editing a different guest (depend on id, not object ref which changes on poll)
  useEffect(() => {
    setGuestName(entry.guestName);
    setGuestPhone(entry.guestPhone ?? '');
    setPartySize(entry.partySize);
    setQuotedWaitMinutes(entry.quotedWaitMinutes != null ? String(entry.quotedWaitMinutes) : '');
    setSeatingPreference(entry.seatingPreference ?? 'Any');
    setSpecialRequests(entry.specialRequests ?? '');
    setIsVip(entry.isVip);
    setNotes(entry.notes ?? '');
    setLocalError(null);
  }, [entry.id]);

  if (!open) return null;

  const displayError = localError || error || null;

  const handleSubmit = async () => {
    if (!guestName.trim()) return;
    setLocalError(null);
    try {
      await onSubmit({
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        partySize,
        quotedWaitMinutes: quotedWaitMinutes ? Number(quotedWaitMinutes) : undefined,
        seatingPreference: seatingPreference !== 'Any' ? seatingPreference : undefined,
        specialRequests: specialRequests.trim() || undefined,
        isVip: isVip || undefined,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update guest');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--fnb-bg-primary)',
    color: 'var(--fnb-text-primary)',
    border: 'var(--fnb-border-subtle)',
    borderRadius: 'var(--fnb-radius-md)',
    padding: '10px 12px',
    fontSize: 'var(--fnb-text-base)',
    fontFamily: 'var(--fnb-font-sans)',
    outline: 'none',
    minHeight: '44px',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--fnb-text-secondary)',
    fontSize: 'var(--fnb-text-sm)',
    fontWeight: 'var(--fnb-font-medium)' as React.CSSProperties['fontWeight'],
    marginBottom: '4px',
    display: 'block',
  };

  const content = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--fnb-bg-overlay)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--fnb-bg-surface)',
          borderRadius: 'var(--fnb-radius-lg)',
          boxShadow: 'var(--fnb-shadow-overlay)',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 'var(--fnb-space-4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--fnb-space-4)',
            borderBottom: 'var(--fnb-border-subtle)',
          }}
        >
          <span
            style={{
              color: 'var(--fnb-text-primary)',
              fontSize: 'var(--fnb-text-lg)',
              fontWeight: 'var(--fnb-font-semibold)',
            }}
          >
            Edit Guest
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fnb-text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '44px',
              minWidth: '44px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--fnb-space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--fnb-space-4)',
          }}
        >
          {/* Guest Name */}
          <div>
            <label style={labelStyle}>
              Guest Name <span style={{ color: 'var(--fnb-danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Enter guest name"
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Phone */}
          <div>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(formatPhoneDisplay(e.target.value))}
              placeholder="(555) 555-5555"
              style={inputStyle}
            />
          </div>

          {/* Party Size */}
          <div>
            <label style={labelStyle}>Party Size</label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--fnb-space-3)',
              }}
            >
              <button
                type="button"
                onClick={() => setPartySize(Math.max(1, partySize - 1))}
                disabled={partySize <= 1}
                style={{
                  background: 'var(--fnb-bg-elevated)',
                  color: partySize <= 1 ? 'var(--fnb-text-disabled)' : 'var(--fnb-text-primary)',
                  border: 'var(--fnb-border-subtle)',
                  borderRadius: 'var(--fnb-radius-md)',
                  width: '44px',
                  height: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: partySize <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <Minus size={18} />
              </button>
              <span
                style={{
                  color: 'var(--fnb-text-primary)',
                  fontSize: 'var(--fnb-text-xl)',
                  fontWeight: 'var(--fnb-font-bold)',
                  fontFamily: 'var(--fnb-font-mono)',
                  minWidth: '40px',
                  textAlign: 'center',
                }}
              >
                {partySize}
              </span>
              <button
                type="button"
                onClick={() => setPartySize(Math.min(20, partySize + 1))}
                disabled={partySize >= 20}
                style={{
                  background: 'var(--fnb-bg-elevated)',
                  color: partySize >= 20 ? 'var(--fnb-text-disabled)' : 'var(--fnb-text-primary)',
                  border: 'var(--fnb-border-subtle)',
                  borderRadius: 'var(--fnb-radius-md)',
                  width: '44px',
                  height: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: partySize >= 20 ? 'not-allowed' : 'pointer',
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Quoted Wait */}
          <div>
            <label style={labelStyle}>Quoted Wait (minutes)</label>
            <input
              type="number"
              value={quotedWaitMinutes}
              onChange={(e) => setQuotedWaitMinutes(e.target.value)}
              placeholder="e.g. 20"
              min={0}
              max={180}
              style={inputStyle}
            />
          </div>

          {/* Seating Preference */}
          <div>
            <label style={labelStyle}>Seating Preference</label>
            <select
              value={seatingPreference}
              onChange={(e) => setSeatingPreference(e.target.value)}
              style={{
                ...inputStyle,
                appearance: 'auto',
              }}
            >
              {SEATING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Special Requests */}
          <div>
            <label style={labelStyle}>Special Requests</label>
            <textarea
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="Allergies, accessibility needs, etc."
              rows={2}
              style={{
                ...inputStyle,
                minHeight: '64px',
                resize: 'vertical',
              }}
            />
          </div>

          {/* VIP Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--fnb-space-2)' }}>
              <Star size={16} style={{ color: isVip ? '#f59e0b' : 'var(--fnb-text-muted)' }} />
              <span
                style={{
                  color: 'var(--fnb-text-primary)',
                  fontSize: 'var(--fnb-text-base)',
                  fontWeight: 'var(--fnb-font-medium)',
                }}
              >
                VIP Guest
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsVip(!isVip)}
              style={{
                width: '48px',
                height: '28px',
                borderRadius: 'var(--fnb-radius-full)',
                background: isVip ? '#f59e0b' : 'var(--fnb-bg-elevated)',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background var(--fnb-duration-micro) ease',
              }}
            >
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: '3px',
                  left: isVip ? '23px' : '3px',
                  transition: 'left var(--fnb-duration-micro) ease',
                }}
              />
            </button>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={2}
              style={{
                ...inputStyle,
                minHeight: '64px',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Error */}
        {displayError && (
          <div
            style={{
              margin: '0 var(--fnb-space-4)',
              padding: '10px 12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--fnb-radius-md)',
              color: 'var(--fnb-danger)',
              fontSize: 'var(--fnb-text-sm)',
            }}
          >
            {displayError}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--fnb-space-3)',
            padding: 'var(--fnb-space-4)',
            borderTop: 'var(--fnb-border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              flex: 1,
              background: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
              border: 'var(--fnb-border-subtle)',
              borderRadius: 'var(--fnb-radius-md)',
              padding: '12px',
              fontSize: 'var(--fnb-text-base)',
              fontWeight: 'var(--fnb-font-medium)',
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!guestName.trim() || isSubmitting}
            style={{
              flex: 1,
              background:
                !guestName.trim() || isSubmitting
                  ? 'var(--fnb-bg-elevated)'
                  : 'var(--fnb-info)',
              color:
                !guestName.trim() || isSubmitting ? 'var(--fnb-text-disabled)' : '#fff',
              border: 'none',
              borderRadius: 'var(--fnb-radius-md)',
              padding: '12px',
              fontSize: 'var(--fnb-text-base)',
              fontWeight: 'var(--fnb-font-semibold)',
              cursor: !guestName.trim() || isSubmitting ? 'not-allowed' : 'pointer',
              minHeight: '48px',
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
