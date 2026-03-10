'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  LogIn,
  LogOut,
  XCircle,
  ArrowRightLeft,
  Plus,
  User,
  Mail,
  Phone,
  StickyNote,
  FileText,
  Copy,
  Check,
  Lock,
  Car,
  Clock,
  Star,
  MapPin,
  ClipboardList,
  Printer,
  Ban,
  Send,
  CreditCard,
  MessageSquare,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { CheckOutDrawer } from './check-out-drawer';

// ── Types ────────────────────────────────────────────────────────

interface VehicleJson {
  licensePlate?: string;
  state?: string;
  make?: string;
  model?: string;
  color?: string;
  hasNoVehicle?: boolean;
}

interface Reservation {
  id: string;
  propertyId: string;
  guestId: string | null;
  primaryGuestJson: { firstName: string; lastName: string; email?: string; phone?: string } | null;
  roomId: string | null;
  roomTypeId: string;
  ratePlanId: string | null;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  nights: number;
  nightlyRateCents: number;
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  status: string;
  sourceType: string | null;
  internalNotes: string | null;
  guestNotes: string | null;
  specialRequests: string | null;
  eta: string | null;
  doNotMove: boolean;
  marketSegment: string | null;
  vehicleJson: VehicleJson | null;
  confirmationNumber: string | null;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  roomNumber: string | null;
  roomFloor: string | null;
  roomTypeName: string | null;
  roomTypeCode: string | null;
  ratePlanName: string | null;
  ratePlanCode: string | null;
  // Guest (expanded)
  guestFirstName: string | null;
  guestLastName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestCustomerId: string | null;
  guestAddressJson: Record<string, unknown> | null;
  guestIsVip: boolean | null;
  guestTotalStays: number | null;
  guestPreferencesJson: Record<string, unknown> | null;
  guestNotes2: string | null;
  folioId: string | null;
  folioStatus: string | null;
  folioTotalCents: number | null;
}

interface FolioEntry {
  id: string;
  entryType: string;
  description: string;
  amountCents: number;
  sourceRef: string | null;
  departmentCode: string | null;
  businessDate: string | null;
  postedAt: string;
  postedBy: string | null;
  postedByName: string | null;
  voidedEntryId: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  isVoided: boolean;
  runningBalanceCents: number;
}

interface FolioSummary {
  totalCharges: number;
  totalPayments: number;
  totalRefunds: number;
  balanceDue: number;
}

interface FolioPaymentMethod {
  cardBrand: string;
  cardLastFour: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
}

interface FolioListItem {
  id: string;
  folioNumber: number | null;
  label: string | null;
  status: string;
  totalCents: number;
  balanceCents: number;
}

interface FolioData {
  id: string;
  folioNumber: number | null;
  label: string | null;
  notes: string | null;
  reservationId: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  depositHeldCents: number;
  checkInDate: string | null;
  checkOutDate: string | null;
  guestJson: { firstName: string; lastName: string } | null;
  confirmationNumber: string | null;
  roomNumber: string | null;
  roomTypeName: string | null;
  ratePlanName: string | null;
  ratePlanCode: string | null;
  nightlyRateCents: number | null;
  propertyName: string | null;
  paymentMethod: FolioPaymentMethod | null;
  entries: FolioEntry[];
  summary: FolioSummary;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  HOLD: { label: 'Hold', variant: 'warning' },
  CONFIRMED: { label: 'Confirmed', variant: 'success' },
  CHECKED_IN: { label: 'Checked In', variant: 'info' },
  CHECKED_OUT: { label: 'Checked Out', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'error' },
  NO_SHOW: { label: 'No Show', variant: 'orange' },
};

const SOURCE_BADGES: Record<string, { label: string; variant: string }> = {
  DIRECT: { label: 'Direct', variant: 'indigo' },
  PHONE: { label: 'Phone', variant: 'purple' },
  WALKIN: { label: 'Walk-In', variant: 'orange' },
  BOOKING_ENGINE: { label: 'Online', variant: 'info' },
  OTA: { label: 'OTA', variant: 'neutral' },
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  ROOM_CHARGE: 'Room',
  TAX: 'Tax',
  FEE: 'Fee',
  ADJUSTMENT: 'Adj',
  PAYMENT: 'Payment',
  REFUND: 'Refund',
  MISC_CHARGE: 'Misc',
  F_AND_B: 'F&B',
  MINIBAR: 'Minibar',
  PARKING: 'Parking',
  SPA: 'Spa',
  PHONE: 'Phone',
  LAUNDRY: 'Laundry',
  INTERNET: 'Internet',
};

const ENTRY_TYPE_COLORS: Record<string, string> = {
  ROOM_CHARGE: 'bg-blue-500/15 text-blue-400',
  TAX: 'bg-amber-500/15 text-amber-400',
  FEE: 'bg-orange-500/15 text-orange-400',
  ADJUSTMENT: 'bg-purple-500/15 text-purple-400',
  PAYMENT: 'bg-green-500/15 text-green-400',
  REFUND: 'bg-red-500/15 text-red-400',
  MISC_CHARGE: 'bg-slate-500/15 text-slate-400',
  F_AND_B: 'bg-rose-500/15 text-rose-400',
  MINIBAR: 'bg-pink-500/15 text-pink-400',
  PARKING: 'bg-cyan-500/15 text-cyan-400',
  SPA: 'bg-violet-500/15 text-violet-400',
  PHONE: 'bg-sky-500/15 text-sky-400',
  LAUNDRY: 'bg-teal-500/15 text-teal-400',
  INTERNET: 'bg-indigo-500/15 text-indigo-400',
};

const MARKET_SEGMENT_LABELS: Record<string, string> = {
  BAR: 'Best Available Rate',
  CORPORATE: 'Corporate',
  GROUP: 'Group',
  OTA: 'OTA',
  WHOLESALE: 'Wholesale',
  GOVERNMENT: 'Government',
  LEISURE: 'Leisure',
  OTHER: 'Other',
};

// ── Helpers ──────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function guestFullName(reservation: Reservation): string {
  if (reservation.guestFirstName && reservation.guestLastName) {
    return `${reservation.guestFirstName} ${reservation.guestLastName}`;
  }
  if (reservation.primaryGuestJson) {
    return `${reservation.primaryGuestJson.firstName} ${reservation.primaryGuestJson.lastName}`;
  }
  return '\u2014';
}

// ── Post Charge Dialog ───────────────────────────────────────────

function PostChargeDialog({
  open,
  onClose,
  folioId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  folioId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [entryType, setEntryType] = useState('FEE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || !amount) return;
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents === 0) return;

    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/folios/${folioId}/entries`, {
        method: 'POST',
        body: JSON.stringify({
          entryType,
          description: description.trim(),
          amountCents,
        }),
      });
      toast.success('Charge posted successfully');
      setDescription('');
      setAmount('');
      setEntryType('FEE');
      onSuccess();
      onClose();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to post charge');
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [folioId, entryType, description, amount, toast, onSuccess, onClose]);

  if (!open) return null;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="Post Charge"
      confirmLabel="Post"
      isLoading={isSubmitting}
    >
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="folio-entry-type" className="block text-sm font-medium text-foreground">Type</label>
          <select
            id="folio-entry-type"
            value={entryType}
            onChange={(e) => setEntryType(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ROOM_CHARGE">Room Charge</option>
            <option value="TAX">Tax</option>
            <option value="FEE">Fee</option>
            <option value="ADJUSTMENT">Adjustment</option>
            <option value="PAYMENT">Payment</option>
            <option value="MISC_CHARGE">Misc Charge</option>
            <option value="F_AND_B">Food & Beverage</option>
            <option value="MINIBAR">Minibar</option>
            <option value="PARKING">Parking</option>
            <option value="SPA">Spa</option>
            <option value="PHONE">Phone</option>
            <option value="LAUNDRY">Laundry</option>
            <option value="INTERNET">Internet</option>
          </select>
        </div>
        <div>
          <label htmlFor="folio-description" className="block text-sm font-medium text-foreground">Description</label>
          <input
            id="folio-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Mini bar charge"
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="folio-amount" className="block text-sm font-medium text-foreground">Amount ($)</label>
          <input
            id="folio-amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
            placeholder="0.00"
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}

// ── Cancel Dialog ────────────────────────────────────────────────

function CancelDialog({
  open,
  onClose,
  reservationId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      toast.success('Reservation cancelled');
      setReason('');
      onSuccess();
      onClose();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to cancel');
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [reservationId, reason, toast, onSuccess, onClose]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="Cancel Reservation"
      description="Are you sure you want to cancel this reservation? This action cannot be undone."
      confirmLabel="Cancel Reservation"
      destructive
      isLoading={isSubmitting}
    >
      <div className="mt-4">
        <label htmlFor="cancel-reason" className="block text-sm font-medium text-foreground">
          Reason (optional)
        </label>
        <input
          id="cancel-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Guest requested cancellation"
          className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>
    </ConfirmDialog>
  );
}

// ── Move Room Dialog ─────────────────────────────────────────────

interface AvailableRoom {
  roomId: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  viewType: string | null;
  wing: string | null;
  status: string;
}

interface CurrentRoomInfo {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
}

const ROOM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  VACANT_INSPECTED: { label: 'Inspected', color: 'bg-blue-500' },
  VACANT_CLEAN: { label: 'Clean', color: 'bg-emerald-500' },
  VACANT_DIRTY: { label: 'Dirty', color: 'bg-amber-500' },
  OCCUPIED: { label: 'Occupied', color: 'bg-red-500' },
};

function formatRoomStatus(status: string): string {
  return ROOM_STATUS_CONFIG[status]?.label ?? status.replace(/_/g, ' ').toLowerCase();
}

function RoomStatusDot({ status }: { status: string }) {
  const config = ROOM_STATUS_CONFIG[status];
  const colorClass = config?.color ?? 'bg-gray-400';
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${colorClass}`}
      title={formatRoomStatus(status)}
      aria-hidden="true"
    />
  );
}

function MoveRoomDialog({
  open,
  onClose,
  reservationId,
  version,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string;
  version: number;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [roomTypes, setRoomTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [allRooms, setAllRooms] = useState<AvailableRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<CurrentRoomInfo | null>(null);

  // Fetch available rooms when dialog opens
  useEffect(() => {
    if (!open) {
      setSelectedRoomTypeId('');
      setSelectedRoomId('');
      setRoomTypes([]);
      setAllRooms([]);
      setCurrentRoom(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    apiFetch<{
      data: {
        currentRoom: CurrentRoomInfo | null;
        roomTypes: Array<{ id: string; name: string }>;
        rooms: AvailableRoom[];
      };
    }>(`/api/v1/pms/reservations/${reservationId}/available-rooms`)
      .then((res) => {
        if (cancelled) return;
        setCurrentRoom(res.data.currentRoom);
        setRoomTypes(res.data.roomTypes);
        setAllRooms(res.data.rooms);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error('Failed to load rooms');
        toast.error(e.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, reservationId, toast]);

  // Filter rooms by selected room type
  const filteredRooms = selectedRoomTypeId
    ? allRooms.filter((r) => r.roomTypeId === selectedRoomTypeId)
    : allRooms;

  // Reset room selection when room type changes
  useEffect(() => {
    setSelectedRoomId('');
  }, [selectedRoomTypeId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedRoomId) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/move-room`, {
        method: 'POST',
        body: JSON.stringify({ newRoomId: selectedRoomId, version }),
      });
      toast.success('Room moved successfully');
      onSuccess();
      onClose();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to move room');
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [reservationId, selectedRoomId, version, toast, onSuccess, onClose]);

  const selectClasses =
    'mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none';

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="Move Room"
      confirmLabel="Move"
      isLoading={isSubmitting}
    >
      {isLoading ? (
        <div className="mt-4 flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">Loading available rooms...</span>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Current Room */}
          {currentRoom && (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Room</div>
              <div className="mt-1 font-medium text-foreground">
                Room {currentRoom.roomNumber} — {currentRoom.roomTypeName}
              </div>
            </div>
          )}

          {allRooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No available rooms found for the remaining stay dates.</p>
          ) : (
            <>
              {/* Room Type Filter */}
              <div>
                <label htmlFor="move-room-type" className="block text-sm font-medium text-foreground">
                  Room Type
                </label>
                <select
                  id="move-room-type"
                  value={selectedRoomTypeId}
                  onChange={(e) => setSelectedRoomTypeId(e.target.value)}
                  className={selectClasses}
                >
                  <option value="">All Room Types ({allRooms.length} available)</option>
                  {roomTypes.map((rt) => {
                    const count = allRooms.filter((r) => r.roomTypeId === rt.id).length;
                    return (
                      <option key={rt.id} value={rt.id}>
                        {rt.name} ({count} available)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Room Selection */}
              <div>
                <label htmlFor="move-room-select" className="block text-sm font-medium text-foreground">
                  Room
                </label>
                <select
                  id="move-room-select"
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className={selectClasses}
                >
                  <option value="">Select a room...</option>
                  {filteredRooms.map((room) => (
                    <option key={room.roomId} value={room.roomId}>
                      {formatRoomStatus(room.status) === 'Inspected' ? '\u2713 ' : formatRoomStatus(room.status) === 'Clean' ? '\u25cf ' : '\u25cb '}
                      Room {room.roomNumber}
                      {room.floor ? ` \u2014 Floor ${room.floor}` : ''}
                      {!selectedRoomTypeId ? ` \u2014 ${room.roomTypeName}` : ''}
                      {` (${formatRoomStatus(room.status)})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Room Details + Confirmation Summary */}
              {selectedRoomId && (() => {
                const room = allRooms.find((r) => r.roomId === selectedRoomId);
                if (!room) return null;
                const isDifferentType = currentRoom && room.roomTypeName !== currentRoom.roomTypeName;
                return (
                  <>
                    <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <RoomStatusDot status={room.status} />
                        <span className="font-medium text-foreground">Room {room.roomNumber}</span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-muted-foreground">
                        <div>Type: {room.roomTypeName}</div>
                        <div className="flex items-center gap-1.5">
                          Status: <RoomStatusDot status={room.status} /> {formatRoomStatus(room.status)}
                        </div>
                        {room.floor && <div>Floor: {room.floor}</div>}
                        {room.viewType && <div>View: {room.viewType}</div>}
                        {room.wing && <div>Wing: {room.wing}</div>}
                      </div>
                    </div>

                    {/* Rate difference warning */}
                    {isDifferentType && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-400">
                        <span className="mt-0.5 shrink-0">&#9888;</span>
                        <span>
                          Moving from <strong>{currentRoom.roomTypeName}</strong> to{' '}
                          <strong>{room.roomTypeName}</strong> — nightly rate may need adjustment after the move.
                        </span>
                      </div>
                    )}

                    {/* Confirmation summary */}
                    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-foreground">
                      <div className="font-medium">Confirm Move</div>
                      <div className="mt-1 text-muted-foreground">
                        {currentRoom ? (
                          <>
                            Room {currentRoom.roomNumber} ({currentRoom.roomTypeName})
                            {' \u2192 '}
                            Room {room.roomNumber} ({room.roomTypeName})
                          </>
                        ) : (
                          <>Move guest to Room {room.roomNumber} ({room.roomTypeName})</>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}

// ── Folio Section ────────────────────────────────────────────────

function FolioSection({
  reservationId,
  folioId,
  guestEmail,
}: {
  reservationId: string;
  folioId: string | null;
  guestEmail?: string | null;
}) {
  const { toast } = useToast();
  const [folio, setFolio] = useState<FolioData | null>(null);
  const [folioList, setFolioList] = useState<FolioListItem[]>([]);
  const [activeFolioId, setActiveFolioId] = useState<string | null>(folioId);
  const [isLoading, setIsLoading] = useState(true);
  const [showPostCharge, setShowPostCharge] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [showCreateFolio, setShowCreateFolio] = useState(false);
  const [expandedEntry, _setExpandedEntry] = useState<string | null>(null);
  const [voidingEntry, setVoidingEntry] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [emailRecipient, setEmailRecipient] = useState(guestEmail ?? '');
  const [notesText, setNotesText] = useState('');
  const [newFolioLabel, setNewFolioLabel] = useState('Company');
  const [transferEntryId, setTransferEntryId] = useState('');
  const [transferToFolioId, setTransferToFolioId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch folio list (multi-folio tabs)
  const fetchFolioList = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: FolioListItem[] }>(
        `/api/v1/pms/reservations/${reservationId}/folios`,
      );
      setFolioList(res.data ?? []);
      // If no active folio selected, pick the first one
      if (!activeFolioId && res.data?.length) {
        setActiveFolioId(res.data[0]!.id);
      }
    } catch {
      // no folios yet
    }
  }, [reservationId, activeFolioId]);

  // Fetch active folio details
  const fetchFolio = useCallback(async () => {
    const fId = activeFolioId;
    if (!fId) {
      // Fall back to reservation-level folio endpoint
      try {
        const res = await apiFetch<{ data: FolioData | null }>(
          `/api/v1/pms/reservations/${reservationId}/folio`,
        );
        setFolio(res.data);
        if (res.data) setActiveFolioId(res.data.id);
      } catch {
        // no folio
      } finally {
        setIsLoading(false);
      }
      return;
    }
    try {
      const res = await apiFetch<{ data: FolioData | null }>(
        `/api/v1/pms/folios/${fId}`,
      );
      setFolio(res.data);
    } catch {
      // folio not found
    } finally {
      setIsLoading(false);
    }
  }, [activeFolioId, reservationId]);

  useEffect(() => {
    fetchFolioList();
  }, [fetchFolioList]);

  useEffect(() => {
    fetchFolio();
  }, [fetchFolio]);

  const refreshAll = useCallback(() => {
    fetchFolioList();
    fetchFolio();
  }, [fetchFolioList, fetchFolio]);

  // Void an entry
  const handleVoid = useCallback(async (entryId: string) => {
    if (!voidReason.trim() || !folio) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/pms/folios/${folio.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ entryId, reason: voidReason }),
      });
      toast.success('Entry voided');
      setVoidingEntry(null);
      setVoidReason('');
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to void entry');
    } finally {
      setIsSaving(false);
    }
  }, [folio, voidReason, toast, refreshAll]);

  // Email folio
  const handleEmailFolio = useCallback(async () => {
    if (!emailRecipient.trim() || !folio) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/pms/folios/${folio.id}/email`, {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: emailRecipient }),
      });
      toast.success(`Folio emailed to ${emailRecipient}`);
      setShowEmailDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to email folio');
    } finally {
      setIsSaving(false);
    }
  }, [folio, emailRecipient, toast]);

  // Update folio notes
  const handleSaveNotes = useCallback(async () => {
    if (!folio) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/pms/folios/${folio.id}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: notesText || null }),
      });
      toast.success('Notes saved');
      setShowNotesEditor(false);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setIsSaving(false);
    }
  }, [folio, notesText, toast, refreshAll]);

  // Create additional folio
  const handleCreateFolio = useCallback(async () => {
    if (!newFolioLabel.trim()) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/folios`, {
        method: 'POST',
        body: JSON.stringify({ label: newFolioLabel }),
      });
      toast.success(`Folio "${newFolioLabel}" created`);
      setShowCreateFolio(false);
      setNewFolioLabel('Company');
      fetchFolioList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create folio');
    } finally {
      setIsSaving(false);
    }
  }, [reservationId, newFolioLabel, toast, fetchFolioList]);

  // Transfer entry
  const handleTransfer = useCallback(async () => {
    if (!transferEntryId || !transferToFolioId || !folio) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/pms/folios/${folio.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          folioEntryId: transferEntryId,
          fromFolioId: folio.id,
          toFolioId: transferToFolioId,
        }),
      });
      toast.success('Entry transferred');
      setShowTransferDialog(false);
      setTransferEntryId('');
      setTransferToFolioId('');
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer entry');
    } finally {
      setIsSaving(false);
    }
  }, [folio, transferEntryId, transferToFolioId, toast, refreshAll]);

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Guest Folio</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 24px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { padding: 5px 8px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background: #f0f0f0; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.08em; border-bottom: 2px solid #999; }
        .text-right { text-align: right; }
        .header-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px 16px; margin-bottom: 12px; padding: 12px; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 4px; }
        .header-grid dt { font-weight: 700; color: #555; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }
        .header-grid dd { margin: 0 0 8px 0; font-size: 12px; }
        .summary { margin-top: 12px; margin-left: auto; max-width: 280px; border-top: 2px solid #333; padding-top: 8px; }
        .summary-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; }
        .summary-total { font-weight: 700; font-size: 13px; border-top: 2px solid #333; padding-top: 6px; margin-top: 4px; }
        .credit { color: #16a34a; }
        h1 { font-size: 16px; margin: 0 0 2px 0; }
        h2 { font-size: 12px; color: #555; margin: 0 0 12px 0; font-weight: normal; }
        tr:nth-child(even) { background: #fafafa; }
        @media print { body { margin: 12px; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!folio) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Folio</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No folio has been created for this reservation yet.
        </p>
      </div>
    );
  }

  const effectiveFolioId = activeFolioId ?? folio.id;
  const guestName = folio.guestJson
    ? `${folio.guestJson.firstName} ${folio.guestJson.lastName}`
    : null;
  const hasMultipleFolios = folioList.length > 1;
  const otherFolios = folioList.filter((f) => f.id !== folio.id);

  // Group entries by business date for date separators
  const groupedEntries: { date: string; entries: FolioEntry[] }[] = [];
  let currentGroup: { date: string; entries: FolioEntry[] } | null = null;
  for (const entry of folio.entries) {
    const dateKey = entry.businessDate ?? entry.postedAt.split('T')[0] ?? '';
    if (!currentGroup || currentGroup.date !== dateKey) {
      currentGroup = { date: dateKey, entries: [] };
      groupedEntries.push(currentGroup);
    }
    currentGroup.entries.push(entry);
  }

  // Night count for header
  const nightCount =
    folio.checkInDate && folio.checkOutDate
      ? Math.max(
          1,
          Math.round(
            (new Date(folio.checkOutDate).getTime() - new Date(folio.checkInDate).getTime()) /
              86400000,
          ),
        )
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Folio Title Bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">
            {folio.label ? `${folio.label} Folio` : 'Guest Folio'}
            {folio.folioNumber != null ? ` #${folio.folioNumber}` : ''}
          </h2>
          <Badge variant={folio.status === 'OPEN' ? 'success' : 'neutral'}>
            {folio.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => { setNotesText(folio.notes ?? ''); setShowNotesEditor(true); }} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent" title="Folio notes">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            Notes
          </button>
          <button type="button" onClick={() => setShowEmailDialog(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent" title="Email folio">
            <Send className="h-3 w-3" aria-hidden="true" />
            Email
          </button>
          <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent" title="Print folio">
            <Printer className="h-3 w-3" aria-hidden="true" />
            Print
          </button>
          {folio.status === 'OPEN' && hasMultipleFolios && (
            <button type="button" onClick={() => setShowTransferDialog(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent" title="Transfer entries">
              <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
              Transfer
            </button>
          )}
          {folio.status === 'OPEN' && (
            <button type="button" onClick={() => setShowPostCharge(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500">
              <Plus className="h-3 w-3" aria-hidden="true" />
              Post Charge
            </button>
          )}
        </div>
      </div>

      {/* Multi-Folio Tabs */}
      {(folioList.length > 0 || folio.status === 'OPEN') && (
        <div className="flex items-center gap-1 border-b border-border bg-muted/20 px-6 py-2">
          {folioList.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFolioId(f.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                f.id === folio.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {f.label ?? 'Guest'}{f.folioNumber != null ? ` #${f.folioNumber}` : ''}
              {f.status === 'CLOSED' && <span className="ml-1 text-[10px] opacity-60">(Closed)</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCreateFolio(true)}
            className="ml-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Add folio (split billing)"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Folio Header — Two-Panel Layout */}
      <div className="border-b border-border bg-muted/30 px-6 py-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left Panel — Guest & Room */}
          <div className="space-y-3">
            {guestName && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Guest Name</p>
                <p className="text-base font-semibold text-foreground">{guestName}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {folio.confirmationNumber && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Confirmation</p>
                  <p className="mt-0.5 font-mono text-sm text-foreground">{folio.confirmationNumber}</p>
                </div>
              )}
              {folio.roomNumber && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Room</p>
                  <p className="mt-0.5 text-sm text-foreground">
                    <span className="font-semibold">{folio.roomNumber}</span>
                    {folio.roomTypeName ? <span className="text-muted-foreground"> {folio.roomTypeName}</span> : ''}
                  </p>
                </div>
              )}
              {folio.nightlyRateCents != null && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Nightly Rate</p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatMoney(folio.nightlyRateCents)}
                    {folio.ratePlanCode ? <span className="ml-1 text-xs text-muted-foreground">({folio.ratePlanCode})</span> : ''}
                  </p>
                </div>
              )}
              {folio.propertyName && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Property</p>
                  <p className="mt-0.5 text-sm text-foreground">{folio.propertyName}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel — Stay & Balance */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {folio.checkInDate && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Arrival</p>
                  <p className="mt-0.5 text-sm text-foreground">{formatDate(folio.checkInDate)}</p>
                </div>
              )}
              {folio.checkOutDate && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Departure</p>
                  <p className="mt-0.5 text-sm text-foreground">{formatDate(folio.checkOutDate)}</p>
                </div>
              )}
              {nightCount != null && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Nights</p>
                  <p className="mt-0.5 text-sm text-foreground">{nightCount}</p>
                </div>
              )}
              {folio.ratePlanName && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Rate Plan</p>
                  <p className="mt-0.5 text-sm text-foreground">{folio.ratePlanName}</p>
                </div>
              )}
            </div>
            {/* Payment method */}
            {folio.paymentMethod && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-foreground">
                  {folio.paymentMethod.cardBrand}
                  {folio.paymentMethod.cardLastFour && ` ••••${folio.paymentMethod.cardLastFour}`}
                  {folio.paymentMethod.cardExpMonth && folio.paymentMethod.cardExpYear && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      Exp {String(folio.paymentMethod.cardExpMonth).padStart(2, '0')}/{folio.paymentMethod.cardExpYear}
                    </span>
                  )}
                </span>
              </div>
            )}
            {/* Balance highlight */}
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Balance Due</span>
                <span
                  className={`text-xl font-bold tabular-nums ${
                    folio.summary.balanceDue > 0 ? 'text-red-500' : 'text-green-500'
                  }`}
                >
                  {folio.summary.balanceDue < 0 && '('}
                  {formatMoney(Math.abs(folio.summary.balanceDue))}
                  {folio.summary.balanceDue < 0 && ')'}
                </span>
              </div>
              {folio.depositHeldCents > 0 && (
                <div className="mt-1.5 flex items-center justify-between border-t border-border/50 pt-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Deposit Held</span>
                  <span className="text-sm font-mono tabular-nums text-amber-400">
                    {formatMoney(folio.depositHeldCents)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Entries Table */}
      {folio.entries.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-muted-foreground">
          No folio entries yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-border bg-muted/60">
                <th className="w-24 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Date
                </th>
                <th className="w-20 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Type
                </th>
                <th className="w-24 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Reference
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Description
                </th>
                <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Charges
                </th>
                <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Credits
                </th>
                <th className="w-28 px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedEntries.map((group) => {
                const groupDate = group.date
                  ? new Date(group.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Unknown';
                return group.entries.map((entry, idx) => {
                  const isCredit = entry.entryType === 'PAYMENT' || entry.entryType === 'REFUND';
                  const typeLabel = ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType;
                  const typeColor = ENTRY_TYPE_COLORS[entry.entryType] ?? 'bg-muted text-muted-foreground';
                  const isVoided = entry.isVoided;
                  const isReversal = !!entry.voidedEntryId;
                  const _isExpanded = expandedEntry === entry.id;
                  const isVoidFormOpen = voidingEntry === entry.id;
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-border/50 transition-colors even:bg-muted/15 ${
                        isVoided ? 'opacity-40' : isReversal ? 'bg-red-500/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">
                        {idx === 0 ? groupDate : ''}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColor}`}>
                          {typeLabel}
                        </span>
                        {entry.departmentCode && (
                          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{entry.departmentCode}</span>
                        )}
                        {isVoided && (
                          <span className="ml-1.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">Void</span>
                        )}
                        {isReversal && (
                          <span className="ml-1.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">Reversal</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {entry.sourceRef ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        <div className="flex items-center gap-2">
                          <span className={isVoided ? 'line-through' : ''}>{entry.description}</span>
                          {entry.postedByName && (
                            <span className="text-[10px] text-muted-foreground" title={`Posted by ${entry.postedByName}`}>
                              — {entry.postedByName}
                            </span>
                          )}
                          {/* Void button (only for non-voided, non-reversal, open folio) */}
                          {folio.status === 'OPEN' && !isVoided && !isReversal && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isVoidFormOpen) {
                                  setVoidingEntry(null);
                                  setVoidReason('');
                                } else {
                                  setVoidingEntry(entry.id);
                                  setVoidReason('');
                                }
                              }}
                              className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 [tr:hover_&]:opacity-100"
                              title="Void entry"
                            >
                              <Ban className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {/* Inline void reason form */}
                        {isVoidFormOpen && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              type="text"
                              value={voidReason}
                              onChange={(e) => setVoidReason(e.target.value)}
                              placeholder="Reason for void..."
                              className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && voidReason.trim()) handleVoid(entry.id);
                                if (e.key === 'Escape') { setVoidingEntry(null); setVoidReason(''); }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleVoid(entry.id)}
                              disabled={!voidReason.trim() || isSaving}
                              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                            >
                              {isSaving ? 'Voiding...' : 'Void'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setVoidingEntry(null); setVoidReason(''); }}
                              className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums ${isVoided ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {!isCredit ? formatMoney(Math.abs(entry.amountCents)) : ''}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums ${isVoided ? 'line-through text-muted-foreground' : 'text-green-500'}`}>
                        {isCredit ? formatMoney(Math.abs(entry.amountCents)) : ''}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums font-medium ${isVoided ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {entry.runningBalanceCents < 0
                          ? `(${formatMoney(Math.abs(entry.runningBalanceCents))})`
                          : formatMoney(entry.runningBalanceCents)}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40">
                <td colSpan={4} className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Totals
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-foreground">
                  {formatMoney(folio.summary.totalCharges)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-green-500">
                  {formatMoney(folio.summary.totalPayments + folio.summary.totalRefunds)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-foreground">
                  {folio.summary.balanceDue < 0
                    ? `(${formatMoney(Math.abs(folio.summary.balanceDue))})`
                    : formatMoney(folio.summary.balanceDue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Folio Summary — Detailed Breakdown */}
      <div className="border-t border-border px-6 py-4">
        <div className="ml-auto max-w-xs space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono tabular-nums text-foreground">{formatMoney(folio.subtotalCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-mono tabular-nums text-foreground">{formatMoney(folio.taxCents)}</span>
          </div>
          {folio.feeCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fees</span>
              <span className="font-mono tabular-nums text-foreground">{formatMoney(folio.feeCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Payments</span>
            <span className="font-mono tabular-nums text-green-500">
              ({formatMoney(folio.summary.totalPayments)})
            </span>
          </div>
          {folio.summary.totalRefunds > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Refunds</span>
              <span className="font-mono tabular-nums text-red-500">
                {formatMoney(folio.summary.totalRefunds)}
              </span>
            </div>
          )}
          <div className="border-t border-border pt-2">
            <div className="flex justify-between">
              <span className="text-sm font-semibold text-foreground">Balance Due</span>
              <span
                className={`text-base font-bold font-mono tabular-nums ${
                  folio.summary.balanceDue > 0 ? 'text-red-500' : 'text-green-500'
                }`}
              >
                {folio.summary.balanceDue < 0 && '('}
                {formatMoney(Math.abs(folio.summary.balanceDue))}
                {folio.summary.balanceDue < 0 && ')'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Print View */}
      <div className="hidden">
        <div ref={printRef}>
          <h1>Guest Charges</h1>
          <h2>
            {folio.propertyName ?? 'Property'}
            {folio.folioNumber != null ? ` — Folio #${folio.folioNumber}` : ''}
          </h2>
          <div className="header-grid">
            {guestName && <><dt>Guest</dt><dd>{guestName}</dd></>}
            {folio.confirmationNumber && <><dt>Confirmation #</dt><dd>{folio.confirmationNumber}</dd></>}
            {folio.roomNumber && <><dt>Room</dt><dd>{folio.roomNumber}{folio.roomTypeName ? ` (${folio.roomTypeName})` : ''}</dd></>}
            {folio.nightlyRateCents != null && <><dt>Nightly Rate</dt><dd>{formatMoney(folio.nightlyRateCents)}{folio.ratePlanCode ? ` (${folio.ratePlanCode})` : ''}</dd></>}
            {folio.checkInDate && <><dt>Arrival</dt><dd>{formatDate(folio.checkInDate)}</dd></>}
            {folio.checkOutDate && <><dt>Departure</dt><dd>{formatDate(folio.checkOutDate)}</dd></>}
            {nightCount != null && <><dt>Nights</dt><dd>{nightCount}</dd></>}
            {folio.ratePlanName && <><dt>Rate Plan</dt><dd>{folio.ratePlanName}</dd></>}
            {folio.paymentMethod && (
              <><dt>Payment</dt><dd>{folio.paymentMethod.cardBrand}{folio.paymentMethod.cardLastFour ? ` ••••${folio.paymentMethod.cardLastFour}` : ''}</dd></>
            )}
            {folio.depositHeldCents > 0 && (
              <><dt>Deposit Held</dt><dd>{formatMoney(folio.depositHeldCents)}</dd></>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Description</th>
                <th className="text-right">Charges</th>
                <th className="text-right">Credits</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {folio.entries.map((entry) => {
                const isCredit = entry.entryType === 'PAYMENT' || entry.entryType === 'REFUND';
                const typeLabel = ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType;
                const displayDate = entry.businessDate
                  ? new Date(entry.businessDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
                  : formatDate(entry.postedAt);
                return (
                  <tr key={entry.id} style={entry.isVoided ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}>
                    <td>{displayDate}</td>
                    <td>{typeLabel}{entry.departmentCode ? ` (${entry.departmentCode})` : ''}{entry.isVoided ? ' [VOID]' : ''}{entry.voidedEntryId ? ' [REVERSAL]' : ''}</td>
                    <td>{entry.sourceRef ?? '—'}</td>
                    <td>{entry.description}{entry.postedByName ? ` (${entry.postedByName})` : ''}</td>
                    <td className="text-right">{!isCredit ? formatMoney(Math.abs(entry.amountCents)) : ''}</td>
                    <td className="text-right">{isCredit ? formatMoney(Math.abs(entry.amountCents)) : ''}</td>
                    <td className="text-right">
                      {entry.runningBalanceCents < 0
                        ? `(${formatMoney(Math.abs(entry.runningBalanceCents))})`
                        : formatMoney(entry.runningBalanceCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="summary">
            <div className="summary-row"><span>Subtotal</span><span>{formatMoney(folio.subtotalCents)}</span></div>
            <div className="summary-row"><span>Tax</span><span>{formatMoney(folio.taxCents)}</span></div>
            {folio.feeCents > 0 && (
              <div className="summary-row"><span>Fees</span><span>{formatMoney(folio.feeCents)}</span></div>
            )}
            <div className="summary-row"><span>Payments</span><span className="credit">({formatMoney(folio.summary.totalPayments)})</span></div>
            {folio.summary.totalRefunds > 0 && (
              <div className="summary-row"><span>Refunds</span><span>{formatMoney(folio.summary.totalRefunds)}</span></div>
            )}
            <div className="summary-row summary-total"><span>Balance Due</span><span>{formatMoney(Math.abs(folio.summary.balanceDue))}</span></div>
          </div>
        </div>
      </div>

      {/* Folio Notes */}
      {folio.notes && !showNotesEditor && (
        <div className="border-t border-border px-6 py-3">
          <div className="flex items-start gap-2">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground italic">{folio.notes}</p>
          </div>
        </div>
      )}

      {/* Email Dialog */}
      <ConfirmDialog
        open={showEmailDialog}
        onClose={() => setShowEmailDialog(false)}
        onConfirm={handleEmailFolio}
        title="Email Folio"
        confirmLabel="Send"
        isLoading={isSaving}
      >
        <div className="mt-4">
          <label htmlFor="email-recipient" className="block text-sm font-medium text-foreground">Recipient Email</label>
          <input
            id="email-recipient"
            type="email"
            value={emailRecipient}
            onChange={(e) => setEmailRecipient(e.target.value)}
            placeholder="guest@example.com"
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </ConfirmDialog>

      {/* Notes Editor Dialog */}
      <ConfirmDialog
        open={showNotesEditor}
        onClose={() => setShowNotesEditor(false)}
        onConfirm={handleSaveNotes}
        title="Folio Notes"
        confirmLabel="Save"
        isLoading={isSaving}
      >
        <div className="mt-4">
          <label htmlFor="folio-notes" className="block text-sm font-medium text-foreground">Notes</label>
          <textarea
            id="folio-notes"
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={4}
            placeholder="Add notes to this folio..."
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </ConfirmDialog>

      {/* Create Folio Dialog */}
      <ConfirmDialog
        open={showCreateFolio}
        onClose={() => setShowCreateFolio(false)}
        onConfirm={handleCreateFolio}
        title="Create Additional Folio"
        confirmLabel="Create"
        isLoading={isSaving}
      >
        <div className="mt-4">
          <label htmlFor="new-folio-label" className="block text-sm font-medium text-foreground">Folio Label</label>
          <select
            id="new-folio-label"
            value={newFolioLabel}
            onChange={(e) => setNewFolioLabel(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="Company">Company</option>
            <option value="Incidentals">Incidentals</option>
            <option value="Group Master">Group Master</option>
            <option value="Travel Agent">Travel Agent</option>
            <option value="Split">Split</option>
          </select>
        </div>
      </ConfirmDialog>

      {/* Transfer Dialog */}
      <ConfirmDialog
        open={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        onConfirm={handleTransfer}
        title="Transfer Entry"
        confirmLabel="Transfer"
        isLoading={isSaving}
      >
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="transfer-entry" className="block text-sm font-medium text-foreground">Entry to Transfer</label>
            <select
              id="transfer-entry"
              value={transferEntryId}
              onChange={(e) => setTransferEntryId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select an entry...</option>
              {folio.entries.filter((e) => !e.isVoided && !e.voidedEntryId).map((e) => (
                <option key={e.id} value={e.id}>
                  {ENTRY_TYPE_LABELS[e.entryType] ?? e.entryType} — {e.description} ({formatMoney(e.amountCents)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="transfer-to-folio" className="block text-sm font-medium text-foreground">Destination Folio</label>
            <select
              id="transfer-to-folio"
              value={transferToFolioId}
              onChange={(e) => setTransferToFolioId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select a folio...</option>
              {otherFolios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label ?? 'Guest'}{f.folioNumber != null ? ` #${f.folioNumber}` : ''} ({formatMoney(f.balanceCents)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </ConfirmDialog>

      {/* Post Charge Dialog */}
      <PostChargeDialog
        open={showPostCharge}
        onClose={() => setShowPostCharge(false)}
        folioId={effectiveFolioId}
        onSuccess={refreshAll}
      />
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────

export default function ReservationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const reservationId = params.id as string;

  // ── State ────────────────────────────────────────────────────────
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [showMoveRoom, setShowMoveRoom] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [copiedConfirmation, setCopiedConfirmation] = useState(false);

  // ── Fetch reservation ─────────────────────────────────────────────
  const fetchReservation = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Reservation }>(
        `/api/v1/pms/reservations/${reservationId}`,
      );
      setReservation(res.data);
    } catch {
      // not found
    } finally {
      setIsLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleCheckIn = useCallback(async () => {
    if (!reservation?.roomId) {
      toast.error('No room assigned. Please assign a room first.');
      return;
    }
    setIsCheckingIn(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/check-in`, {
        method: 'POST',
        body: JSON.stringify({ roomId: reservation.roomId, version: reservation.version }),
      });
      toast.success('Guest checked in successfully');
      fetchReservation();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to check in');
      toast.error(e.message);
    } finally {
      setIsCheckingIn(false);
    }
  }, [reservationId, reservation, toast, fetchReservation]);


  // ── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse rounded bg-muted" />
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-6 lg:col-span-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-surface p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Not found state ──────────────────────────────────────────────
  if (!reservation) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/pms/reservations')}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Reservations
        </button>
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <XCircle className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            Reservation not found
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The reservation you are looking for does not exist or has been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/pms/reservations')}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Go to Reservations
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = STATUS_BADGES[reservation.status] ?? {
    label: reservation.status,
    variant: 'neutral',
  };
  const sourceBadge = reservation.sourceType
    ? STATUS_BADGES[reservation.sourceType] ??
      SOURCE_BADGES[reservation.sourceType] ?? { label: reservation.sourceType, variant: 'neutral' }
    : null;

  const guest = guestFullName(reservation);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/pms/reservations')}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Reservations
      </button>

      {/* Reservation Header */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">
                Reservation #{reservation.id.slice(-8).toUpperCase()}
              </h1>
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
              {reservation.doNotMove && (
                <Badge variant="warning">
                  <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  Do Not Move
                </Badge>
              )}
              {reservation.guestIsVip && (
                <Badge variant="orange">
                  <Star className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  VIP
                </Badge>
              )}
            </div>
            <p className="mt-1 text-lg text-foreground">{guest}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {/* Confirmation # badge */}
              {reservation.confirmationNumber && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(reservation.confirmationNumber!);
                      setCopiedConfirmation(true);
                      setTimeout(() => setCopiedConfirmation(false), 2000);
                    } catch {
                      // Fallback: select text for manual copy
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-mono text-foreground transition-colors hover:bg-accent"
                  title="Click to copy confirmation number"
                >
                  Conf# {reservation.confirmationNumber}
                  {copiedConfirmation ? (
                    <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
              )}
              {sourceBadge && (
                <Badge variant={sourceBadge.variant}>{sourceBadge.label}</Badge>
              )}
              {reservation.marketSegment && (
                <Badge variant="indigo">
                  {MARKET_SEGMENT_LABELS[reservation.marketSegment] ?? reservation.marketSegment}
                </Badge>
              )}
              <span>Created: {formatDateTime(reservation.createdAt)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {reservation.status === 'CONFIRMED' && (
              <>
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isCheckingIn}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  {isCheckingIn ? 'Checking In...' : 'Check In'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancel(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </button>
              </>
            )}
            {reservation.status === 'HOLD' && (
              <>
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isCheckingIn}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancel(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </button>
              </>
            )}
            {reservation.status === 'CHECKED_IN' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCheckOut(true)}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Check Out
                </button>
                <button
                  type="button"
                  onClick={() => setShowMoveRoom(true)}
                  disabled={reservation.doNotMove}
                  title={reservation.doNotMove ? 'This reservation is flagged as Do Not Move' : undefined}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                  Move Room
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Reservation Details */}
        <div className="rounded-lg border border-border bg-surface p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground">
            Reservation Details
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailRow label="Room Type" value={reservation.roomTypeName ?? '\u2014'} />
            <DetailRow
              label="Room Number"
              value={reservation.roomNumber ?? 'Unassigned'}
            />
            <DetailRow label="Check-In" value={formatDate(reservation.checkInDate)} />
            <DetailRow label="Check-Out" value={formatDate(reservation.checkOutDate)} />
            <DetailRow label="Nights" value={String(reservation.nights)} />
            <DetailRow
              label="Guests"
              value={`${reservation.adults} Adult${reservation.adults !== 1 ? 's' : ''}${
                reservation.children > 0
                  ? `, ${reservation.children} Child${reservation.children !== 1 ? 'ren' : ''}`
                  : ''
              }`}
            />
            {reservation.sourceType && (
              <DetailRow label="Source" value={reservation.sourceType} />
            )}
            {reservation.ratePlanName && (
              <DetailRow label="Rate Plan" value={reservation.ratePlanName} />
            )}
            {reservation.marketSegment && (
              <DetailRow label="Market Segment" value={MARKET_SEGMENT_LABELS[reservation.marketSegment] ?? reservation.marketSegment} />
            )}
            <DetailRow
              label="Nightly Rate"
              value={formatMoney(reservation.nightlyRateCents)}
            />
            <DetailRow
              label="Total"
              value={formatMoney(reservation.totalCents)}
              highlight
            />
            {reservation.eta && (
              <DetailRow label="ETA" value={reservation.eta} />
            )}
          </div>
        </div>

        {/* Right: Guest Profile + Special Requests + Vehicle + Notes */}
        <div className="space-y-6">
          {/* Guest Profile Card */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Guest Profile</h2>
              {reservation.guestIsVip && (
                <Badge variant="orange">
                  <Star className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  VIP
                </Badge>
              )}
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-foreground">{guest}</span>
              </div>
              {(reservation.guestEmail || reservation.primaryGuestJson?.email) && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-foreground">
                    {reservation.guestEmail || reservation.primaryGuestJson?.email}
                  </span>
                </div>
              )}
              {(reservation.guestPhone || reservation.primaryGuestJson?.phone) && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-foreground">
                    {reservation.guestPhone || reservation.primaryGuestJson?.phone}
                  </span>
                </div>
              )}
              {reservation.guestAddressJson && Object.keys(reservation.guestAddressJson).length > 0 && (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-foreground">
                    {[
                      reservation.guestAddressJson.street,
                      reservation.guestAddressJson.city,
                      reservation.guestAddressJson.state,
                      reservation.guestAddressJson.zip,
                      reservation.guestAddressJson.country,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
              {reservation.guestTotalStays != null && reservation.guestTotalStays > 0 && (
                <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {reservation.guestTotalStays} previous stay{reservation.guestTotalStays !== 1 ? 's' : ''}
                </div>
              )}
              {reservation.guestPreferencesJson && Object.keys(reservation.guestPreferencesJson).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground">Preferences</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(reservation.guestPreferencesJson).map(([key, val]) => (
                      <span key={key} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                        {String(key)}: {String(val)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {reservation.guestNotes2 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground">Guest Notes</p>
                  <p className="mt-1 text-sm text-foreground">{reservation.guestNotes2}</p>
                </div>
              )}
            </div>
          </div>

          {/* Special Requests */}
          {reservation.specialRequests && (
            <div className="rounded-lg border border-border bg-surface p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Special Requests
              </h2>
              <p className="mt-3 text-sm text-foreground">{reservation.specialRequests}</p>
            </div>
          )}

          {/* Vehicle Info */}
          {reservation.vehicleJson && !reservation.vehicleJson.hasNoVehicle &&
            (reservation.vehicleJson.licensePlate || reservation.vehicleJson.make) && (
            <div className="rounded-lg border border-border bg-surface p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Car className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Vehicle
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {reservation.vehicleJson.licensePlate && (
                  <DetailRow label="License Plate" value={reservation.vehicleJson.licensePlate} />
                )}
                {reservation.vehicleJson.state && (
                  <DetailRow label="State/Province" value={reservation.vehicleJson.state} />
                )}
                {reservation.vehicleJson.make && (
                  <DetailRow label="Make" value={reservation.vehicleJson.make} />
                )}
                {reservation.vehicleJson.model && (
                  <DetailRow label="Model" value={reservation.vehicleJson.model} />
                )}
                {reservation.vehicleJson.color && (
                  <DetailRow label="Color" value={reservation.vehicleJson.color} />
                )}
              </div>
            </div>
          )}

          {/* ETA */}
          {reservation.eta && (
            <div className="rounded-lg border border-border bg-surface p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Estimated Arrival
              </h2>
              <p className="mt-3 text-sm font-medium text-foreground">{reservation.eta}</p>
            </div>
          )}

          {/* Notes */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <StickyNote className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Notes
            </h2>
            {reservation.internalNotes ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Internal Notes</p>
                <p className="mt-1 text-sm text-foreground">
                  {reservation.internalNotes}
                </p>
              </div>
            ) : null}
            {reservation.guestNotes ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Guest Notes</p>
                <p className="mt-1 text-sm text-foreground">
                  {reservation.guestNotes}
                </p>
              </div>
            ) : null}
            {!reservation.internalNotes && !reservation.guestNotes && (
              <p className="mt-3 text-sm text-muted-foreground">No notes added.</p>
            )}
          </div>
        </div>
      </div>

      {/* Folio Section */}
      <FolioSection
        reservationId={reservationId}
        folioId={reservation.folioId}
        guestEmail={reservation.guestEmail}
      />

      {/* Cancel Dialog */}
      <CancelDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        reservationId={reservationId}
        onSuccess={fetchReservation}
      />

      {/* Move Room Dialog */}
      <MoveRoomDialog
        open={showMoveRoom}
        onClose={() => setShowMoveRoom(false)}
        reservationId={reservationId}
        version={reservation.version}
        onSuccess={fetchReservation}
      />

      {/* Check Out Drawer */}
      <CheckOutDrawer
        open={showCheckOut}
        onClose={() => setShowCheckOut(false)}
        reservation={reservation}
        onSuccess={fetchReservation}
      />
    </div>
  );
}

// ── Detail Row Helper ────────────────────────────────────────────

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-sm ${
          highlight ? 'font-semibold text-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
