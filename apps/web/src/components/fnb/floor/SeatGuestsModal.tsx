'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus } from 'lucide-react';

interface SeatGuestsModalProps {
  open: boolean;
  onClose: () => void;
  tableNumber: number;
  tableCapacity: number;
  onConfirm: (partySize: number) => void;
}

export function SeatGuestsModal({ open, onClose, tableNumber, tableCapacity, onConfirm }: SeatGuestsModalProps) {
  const [partySize, setPartySize] = useState(2);

  if (!open) return null;

  const quickSizes = [1, 2, 3, 4, 5, 6, 7, 8];

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--fnb-z-modal)', backgroundColor: 'var(--fnb-bg-overlay)' }}
    >
      <div
        className="rounded-xl p-6 shadow-lg w-[340px]"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Seat Table {tableNumber}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Party size label */}
        <p className="text-xs mb-3" style={{ color: 'var(--fnb-text-muted)' }}>
          Capacity: {tableCapacity} &middot; Party size:
        </p>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            type="button"
            onClick={() => setPartySize(Math.max(1, partySize - 1))}
            className="flex items-center justify-center rounded-lg fnb-touch-min transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
          >
            <Minus className="h-5 w-5" />
          </button>
          <span
            className="text-3xl font-bold fnb-mono w-16 text-center"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            {partySize}
          </span>
          <button
            type="button"
            onClick={() => setPartySize(partySize + 1)}
            className="flex items-center justify-center rounded-lg fnb-touch-min transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Quick sizes */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {quickSizes.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPartySize(n)}
              className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                partySize === n ? 'text-white' : ''
              }`}
              style={{
                backgroundColor: partySize === n ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
                color: partySize === n ? '#fff' : 'var(--fnb-text-secondary)',
              }}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg py-3 text-sm font-semibold transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(partySize); onClose(); }}
            className="flex-1 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Seat {partySize} Guests
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
