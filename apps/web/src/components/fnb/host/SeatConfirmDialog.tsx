'use client';

import { createPortal } from 'react-dom';
import { Users, Hash, User, AlertTriangle } from 'lucide-react';

interface SeatConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSeating: boolean;
  party: {
    guestName: string;
    partySize: number;
    type: 'waitlist' | 'reservation';
    waitMinutes?: number;
    seatingPreference?: string | null;
  };
  table: {
    tableNumber: number | string;
    capacity: number;
    sectionName?: string | null;
    serverName?: string | null;
  };
}

export function SeatConfirmDialog({
  open,
  onClose,
  onConfirm,
  isSeating,
  party,
  table,
}: SeatConfirmDialogProps) {
  if (!open) return null;

  const oversized = table.capacity > party.partySize * 1.5;

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
          className="px-5 py-4"
          style={{ borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <h2
            className="text-sm font-bold"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            Confirm Seating
          </h2>
        </div>

        {/* Content */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Party Info */}
          <div
            className="rounded-lg px-4 py-3"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-wider block mb-2"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              Guest
            </span>
            <div className="flex items-center gap-2 mb-1">
              <User size={13} style={{ color: 'var(--fnb-text-secondary)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                {party.guestName}
              </span>
              <span
                className="text-[9px] font-medium rounded px-1.5 py-0.5"
                style={{
                  backgroundColor: party.type === 'reservation'
                    ? 'rgba(59, 130, 246, 0.1)'
                    : 'rgba(245, 158, 11, 0.1)',
                  color: party.type === 'reservation'
                    ? 'var(--fnb-info)'
                    : 'var(--fnb-warning)',
                }}
              >
                {party.type === 'reservation' ? 'Reservation' : 'Walk-in'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Users size={11} style={{ color: 'var(--fnb-text-muted)' }} />
                <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
                  Party of {party.partySize}
                </span>
              </div>
              {party.waitMinutes != null && (
                <span className="text-[11px]" style={{ color: 'var(--fnb-text-muted)' }}>
                  Waited {party.waitMinutes}m
                </span>
              )}
            </div>
            {party.seatingPreference && (
              <span className="text-[10px] mt-1 block" style={{ color: 'var(--fnb-text-muted)' }}>
                Prefers: {party.seatingPreference}
              </span>
            )}
          </div>

          {/* Table Info */}
          <div
            className="rounded-lg px-4 py-3"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-wider block mb-2"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              Table
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Hash size={12} style={{ color: 'var(--fnb-text-secondary)' }} />
                <span className="text-xs font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                  {table.tableNumber}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Users size={11} style={{ color: 'var(--fnb-text-muted)' }} />
                <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
                  Seats {table.capacity}
                </span>
              </div>
            </div>
            {table.serverName && (
              <span className="text-[10px] mt-1 block" style={{ color: 'var(--fnb-text-muted)' }}>
                Server: {table.serverName}
              </span>
            )}
            {table.sectionName && (
              <span className="text-[10px] block" style={{ color: 'var(--fnb-text-muted)' }}>
                Section: {table.sectionName}
              </span>
            )}
          </div>

          {/* Oversized warning */}
          {oversized && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--fnb-warning) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--fnb-warning) 20%, transparent)',
              }}
            >
              <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--fnb-warning)' }} />
              <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
                Seating party of {party.partySize} at a {table.capacity}-top
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="px-5 py-3 flex gap-2"
          style={{ borderTop: 'var(--fnb-border-subtle)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSeating}
            className="flex-1 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSeating}
            className="flex-1 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--fnb-status-available)',
              color: '#fff',
            }}
          >
            {isSeating ? 'Seating…' : 'Confirm & Seat'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
