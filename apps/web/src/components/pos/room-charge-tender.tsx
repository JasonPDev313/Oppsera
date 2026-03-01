'use client';

import { useState, useCallback } from 'react';
import { DoorOpen } from 'lucide-react';
import { GuestSearchDialog } from './guest-search-dialog';
import { usePmsPOS } from '@/hooks/use-pms-pos';
import type { PosGuestResult, PosFolioSummary } from '@/hooks/use-pms-pos';

interface RoomChargeTenderProps {
  /** Total amount in cents to charge to the room */
  amountCents: number;
  locationId?: string;
  /** Called when the user confirms room charge — parent calls recordTender with these params */
  onRoomCharge: (params: {
    tenderType: 'room_charge';
    amountGiven: number;
    metadata: {
      folioId: string;
      guestId: string;
      guestName: string;
      roomNumber: string;
      reservationId: string;
    };
  }) => void;
  /** Called when a folio is linked to the current tab */
  onFolioLinked?: (folioId: string, guestName: string) => void;
  disabled?: boolean;
}

export function RoomChargeTender({
  amountCents,
  locationId,
  onRoomCharge,
  onFolioLinked,
  disabled,
}: RoomChargeTenderProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const pms = usePmsPOS(locationId);

  const handleSelectGuest = useCallback(
    (guest: PosGuestResult, folio: PosFolioSummary) => {
      setDialogOpen(false);

      // Notify parent about folio link for tab display
      onFolioLinked?.(folio.folioId, `${guest.firstName} ${guest.lastName}`);

      // Fire the room charge tender
      onRoomCharge({
        tenderType: 'room_charge',
        amountGiven: amountCents,
        metadata: {
          folioId: folio.folioId,
          guestId: guest.guestId,
          guestName: `${guest.firstName} ${guest.lastName}`,
          roomNumber: guest.roomNumber,
          reservationId: guest.reservationId,
        },
      });
    },
    [amountCents, onRoomCharge, onFolioLinked],
  );

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        disabled={disabled || amountCents <= 0}
        className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm font-medium text-indigo-500 transition-colors hover:bg-indigo-500/20 disabled:opacity-40"
      >
        <DoorOpen className="h-4 w-4" aria-hidden="true" />
        Room Charge
      </button>

      <GuestSearchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelectGuest={handleSelectGuest}
        searchGuests={pms.searchGuests}
        lookupByRoom={pms.lookupByRoom}
        getGuestFolio={pms.getGuestFolio}
        isSearching={pms.isSearching}
      />
    </>
  );
}
