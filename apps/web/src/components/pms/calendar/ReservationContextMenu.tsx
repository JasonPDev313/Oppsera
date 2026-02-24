'use client';

import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import {
  Eye,
  LogIn,
  LogOut,
  ArrowRightLeft,
  MapPin,
  XCircle,
  ShoppingCart,
  Copy,
} from 'lucide-react';

export interface ContextMenuState {
  x: number;
  y: number;
  reservationId: string;
  status: string;
  confirmationNumber: string | null;
}

interface ReservationContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onViewReservation: (id: string) => void;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  onCancel?: (id: string) => void;
  onCheckInToPos?: (id: string) => void;
  isPostingToPos?: boolean;
}

export default function ReservationContextMenu({
  state,
  onClose,
  onViewReservation,
  onCheckIn,
  onCheckOut,
  onCancel,
  onCheckInToPos,
  isPostingToPos,
}: ReservationContextMenuProps) {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const canCheckIn = state.status === 'CONFIRMED';
  const canCheckOut = state.status === 'CHECKED_IN';
  const canCancel = state.status === 'HOLD' || state.status === 'CONFIRMED';
  const canSendToPos = ['HOLD', 'CONFIRMED', 'CHECKED_IN'].includes(state.status);

  const handleCopyConfirmation = () => {
    if (state.confirmationNumber) {
      navigator.clipboard.writeText(state.confirmationNumber);
    }
    onClose();
  };

  return createPortal(
    <div
      className="fixed z-50 min-w-52 rounded-lg border border-gray-200 bg-surface py-1 shadow-lg"
      style={{
        left: Math.min(state.x, window.innerWidth - 220),
        top: Math.min(state.y, window.innerHeight - 300),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem icon={Eye} label="View Reservation" onClick={() => { onViewReservation(state.reservationId); onClose(); }} />

      {canCheckIn && onCheckIn && (
        <MenuItem icon={LogIn} label="Check In" onClick={() => { onCheckIn(state.reservationId); onClose(); }} />
      )}

      {canCheckOut && onCheckOut && (
        <MenuItem icon={LogOut} label="Check Out" onClick={() => { onCheckOut(state.reservationId); onClose(); }} />
      )}

      <MenuItem icon={ArrowRightLeft} label="Move Room" disabled onClick={() => onClose()} />
      <MenuItem icon={MapPin} label="Assign Room" disabled onClick={() => onClose()} />

      {canCancel && onCancel && (
        <MenuItem icon={XCircle} label="Cancel" onClick={() => { onCancel(state.reservationId); onClose(); }} destructive />
      )}

      <div className="my-1 border-t border-gray-100" />

      {canSendToPos && onCheckInToPos && (
        <MenuItem
          icon={ShoppingCart}
          label={isPostingToPos ? 'Sending to POS...' : 'Check In & Send to POS'}
          disabled={isPostingToPos}
          onClick={() => onCheckInToPos(state.reservationId)}
        />
      )}

      {state.confirmationNumber && (
        <MenuItem icon={Copy} label="Copy Confirmation #" onClick={handleCopyConfirmation} />
      )}
    </div>,
    document.body,
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-100/50'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}
