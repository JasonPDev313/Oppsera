'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, User, DoorOpen, Star } from 'lucide-react';
import type { PosGuestResult, PosFolioSummary } from '@/hooks/use-pms-pos';

interface GuestSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectGuest: (guest: PosGuestResult, folio: PosFolioSummary) => void;
  searchGuests: (query: string) => Promise<PosGuestResult[]>;
  lookupByRoom: (room: string) => Promise<PosGuestResult | null>;
  getGuestFolio: (guestId: string) => Promise<PosFolioSummary | null>;
  isSearching: boolean;
}

export function GuestSearchDialog({
  open,
  onClose,
  onSelectGuest,
  searchGuests,
  lookupByRoom,
  getGuestFolio,
  isSearching,
}: GuestSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosGuestResult[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<PosGuestResult | null>(null);
  const [folio, setFolio] = useState<PosFolioSummary | null>(null);
  const [loadingFolio, setLoadingFolio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedGuest(null);
      setFolio(null);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedGuest(null);
      setFolio(null);
      setError(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value || value.length < 2) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        // Check if it looks like a room number (all digits, 1-4 chars)
        if (/^\d{1,4}$/.test(value.trim())) {
          const guest = await lookupByRoom(value.trim());
          if (guest) {
            setResults([guest]);
            return;
          }
        }
        const found = await searchGuests(value);
        setResults(found);
      }, 300);
    },
    [searchGuests, lookupByRoom],
  );

  // Select a guest and load their folio
  const handleSelectGuest = useCallback(
    async (guest: PosGuestResult) => {
      setSelectedGuest(guest);
      setLoadingFolio(true);
      setError(null);
      try {
        const f = await getGuestFolio(guest.guestId);
        if (!f) {
          setError(`No active folio found for ${guest.firstName} ${guest.lastName}`);
          setFolio(null);
        } else {
          setFolio(f);
        }
      } catch {
        setError('Failed to load folio');
      } finally {
        setLoadingFolio(false);
      }
    },
    [getGuestFolio],
  );

  // Confirm selection
  const handleConfirm = useCallback(() => {
    if (selectedGuest && folio) {
      onSelectGuest(selectedGuest, folio);
    }
  }, [selectedGuest, folio, onSelectGuest]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-search-dialog-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl bg-surface shadow-xl"
           style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="guest-search-dialog-title" className="text-lg font-semibold">
            <DoorOpen className="mr-2 inline-block h-5 w-5 text-indigo-500" aria-hidden="true" />
            Room Charge — Guest Lookup
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-accent/50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search input */}
        <div className="border-b border-border px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by guest name or room number..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto px-6 py-3" style={{ minHeight: 120, maxHeight: 300 }}>
          {isSearching && (
            <p className="py-4 text-center text-sm text-muted-foreground">Searching...</p>
          )}

          {!isSearching && query.length >= 2 && results.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No checked-in guests found</p>
          )}

          {!isSearching && results.length > 0 && (
            <ul className="space-y-2">
              {results.map((g) => (
                <li key={g.guestId}>
                  <button
                    onClick={() => handleSelectGuest(g)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedGuest?.guestId === g.guestId
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-border hover:bg-accent/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="font-medium">
                          {g.firstName} {g.lastName}
                        </span>
                        {g.isVip && (
                          <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        )}
                      </div>
                      <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
                        Room {g.roomNumber}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g.checkInDate} — {g.checkOutDate}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Folio summary / Error */}
        {selectedGuest && (
          <div className="border-t border-border px-6 py-3">
            {loadingFolio && (
              <p className="text-sm text-muted-foreground">Loading folio...</p>
            )}
            {error && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}
            {folio && !loadingFolio && (
              <div className="rounded-lg bg-green-500/10 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-500">
                      {folio.guestName} — Room {folio.roomNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Folio balance: ${(folio.balanceCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-input px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedGuest || !folio || loadingFolio}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            Charge to Room
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
