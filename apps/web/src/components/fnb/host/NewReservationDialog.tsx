'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, Star } from 'lucide-react';

interface NewReservationDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    guestName: string;
    guestPhone?: string;
    partySize: number;
    reservationDate: string;
    reservationTime: string;
    durationMinutes?: number;
    seatingPreference?: string;
    specialRequests?: string;
    occasion?: string;
    isVip?: boolean;
    notes?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  defaultDuration: number;
}

const SEATING_OPTIONS = ['Any', 'Booth', 'Bar', 'Patio', 'High Top', 'Window'];

const OCCASION_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'business', label: 'Business' },
  { value: 'date_night', label: 'Date Night' },
  { value: 'celebration', label: 'Celebration' },
  { value: 'other', label: 'Other' },
];

const DURATION_OPTIONS = [
  { value: 60, label: '60 min' },
  { value: 75, label: '75 min' },
  { value: 90, label: '90 min' },
  { value: 120, label: '2 hours' },
  { value: 150, label: '2.5 hours' },
  { value: 180, label: '3 hours' },
];

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function NewReservationDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  defaultDuration,
}: NewReservationDialogProps) {
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [reservationDate, setReservationDate] = useState(getTodayStr());
  const [reservationTime, setReservationTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState(defaultDuration);
  const [seatingPreference, setSeatingPreference] = useState('Any');
  const [occasion, setOccasion] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const handleSubmit = async () => {
    if (!guestName.trim() || !reservationDate || !reservationTime) return;
    await onSubmit({
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim() || undefined,
      partySize,
      reservationDate,
      reservationTime,
      durationMinutes,
      seatingPreference: seatingPreference !== 'Any' ? seatingPreference : undefined,
      specialRequests: specialRequests.trim() || undefined,
      occasion: occasion || undefined,
      isVip: isVip || undefined,
      notes: notes.trim() || undefined,
    });
    // Reset form
    setGuestName('');
    setGuestPhone('');
    setPartySize(2);
    setReservationDate(getTodayStr());
    setReservationTime('19:00');
    setDurationMinutes(defaultDuration);
    setSeatingPreference('Any');
    setOccasion('');
    setSpecialRequests('');
    setIsVip(false);
    setNotes('');
  };

  const canSubmit = guestName.trim() && reservationDate && reservationTime && !isSubmitting;

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
    fontWeight: 'var(--fnb-font-medium)' as any,
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
          maxWidth: '520px',
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
            New Reservation
          </span>
          <button
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
              onChange={(e) => setGuestPhone(e.target.value)}
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

          {/* Date + Time row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--fnb-space-3)' }}>
            <div>
              <label style={labelStyle}>
                Date <span style={{ color: 'var(--fnb-danger)' }}>*</span>
              </label>
              <input
                type="date"
                value={reservationDate}
                onChange={(e) => setReservationDate(e.target.value)}
                min={getTodayStr()}
                style={{
                  ...inputStyle,
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>
                Time <span style={{ color: 'var(--fnb-danger)' }}>*</span>
              </label>
              <input
                type="time"
                value={reservationTime}
                onChange={(e) => setReservationTime(e.target.value)}
                step={900}
                style={{
                  ...inputStyle,
                  colorScheme: 'dark',
                }}
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label style={labelStyle}>Duration</label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              style={{
                ...inputStyle,
                appearance: 'auto',
              }}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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

          {/* Occasion */}
          <div>
            <label style={labelStyle}>Occasion</label>
            <select
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              style={{
                ...inputStyle,
                appearance: 'auto',
              }}
            >
              {OCCASION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
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
              placeholder="Allergies, accessibility needs, high chair, etc."
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1,
              background: canSubmit ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
              color: canSubmit ? '#fff' : 'var(--fnb-text-disabled)',
              border: 'none',
              borderRadius: 'var(--fnb-radius-md)',
              padding: '12px',
              fontSize: 'var(--fnb-text-base)',
              fontWeight: 'var(--fnb-font-semibold)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              minHeight: '48px',
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Reservation'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
