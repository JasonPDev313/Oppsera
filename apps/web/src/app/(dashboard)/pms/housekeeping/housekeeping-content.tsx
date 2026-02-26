'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  AlertTriangle,
  BedDouble,
  Ban,
  CheckCircle2,
  X,
  Play,
  CheckCheck,
  SkipForward,
  UserPlus,
  Clock,
  ArrowRight,
  RefreshCw,
  User,
  LogIn,
  LogOut,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface HousekeepingRoom {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
  currentGuest: { name: string; checkOutDate: string } | null;
  arrivingGuest: { name: string; checkInDate: string } | null;
  departingToday: boolean;
  arrivingToday: boolean;
}

interface Housekeeper {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
}

interface HousekeepingAssignment {
  id: string;
  roomId: string;
  roomNumber: string;
  housekeeperId: string;
  housekeeperName: string;
  priority: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'VACANT_CLEAN', label: 'Vacant Clean' },
  { value: 'VACANT_DIRTY', label: 'Vacant Dirty' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'OUT_OF_ORDER', label: 'Out of Order' },
];

const STATUS_BADGE: Record<string, { label: string; variant: string }> = {
  VACANT_CLEAN: { label: 'Clean', variant: 'success' },
  VACANT_DIRTY: { label: 'Dirty', variant: 'warning' },
  OCCUPIED: { label: 'Occupied', variant: 'info' },
  OUT_OF_ORDER: { label: 'Out of Order', variant: 'error' },
};

const ASSIGNMENT_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/20 text-blue-500' },
  completed: { label: 'Completed', color: 'bg-green-500/20 text-green-500' },
  skipped: { label: 'Skipped', color: 'bg-amber-500/20 text-amber-500' },
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  VACANT_CLEAN: ['VACANT_DIRTY', 'OUT_OF_ORDER'],
  VACANT_DIRTY: ['VACANT_CLEAN', 'OUT_OF_ORDER'],
  OCCUPIED: ['VACANT_DIRTY', 'OUT_OF_ORDER'],
  OUT_OF_ORDER: ['VACANT_DIRTY', 'VACANT_CLEAN'],
};

const STATUS_LABELS: Record<string, string> = {
  VACANT_CLEAN: 'Clean',
  VACANT_DIRTY: 'Dirty',
  OCCUPIED: 'Occupied',
  OUT_OF_ORDER: 'Out of Order',
};

// ── Helpers ──────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Stat Card ────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Room Card ────────────────────────────────────────────────────

function RoomCard({
  room,
  isSelected,
  onClick,
}: {
  room: HousekeepingRoom;
  isSelected: boolean;
  onClick: () => void;
}) {
  const badge = STATUS_BADGE[room.status] ?? { label: room.status, variant: 'neutral' };
  const isDirty = room.status === 'VACANT_DIRTY';
  const isOccupied = room.status === 'OCCUPIED';

  return (
    <div
      className={`cursor-pointer rounded-lg border bg-surface p-4 transition-colors ${
        isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-500/20'
          : isDirty
            ? 'border-amber-500/40 hover:border-amber-500/60'
            : 'border-border hover:border-muted-foreground'
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-bold text-foreground">{room.roomNumber}</h3>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{room.roomTypeName}</p>
      {room.floor && <p className="text-xs text-muted-foreground">Floor {room.floor}</p>}

      {room.currentGuest && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground">Current Guest</p>
          <p className="text-sm text-foreground">{room.currentGuest.name}</p>
          <p className="text-xs text-muted-foreground">Checkout: {room.currentGuest.checkOutDate}</p>
        </div>
      )}

      {room.arrivingGuest && !room.currentGuest && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground">Arriving Today</p>
          <p className="text-sm text-foreground">{room.arrivingGuest.name}</p>
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        {room.departingToday && isOccupied && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-500">
            <LogOut className="h-3 w-3" aria-hidden="true" /> Departing
          </span>
        )}
        {room.arrivingToday && !room.currentGuest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-500">
            <LogIn className="h-3 w-3" aria-hidden="true" /> Arriving
          </span>
        )}
      </div>
    </div>
  );
}

// ── Assign Housekeeper Dialog ────────────────────────────────────

function AssignHousekeeperDialog({
  open,
  onClose,
  room,
  housekeepers,
  propertyId,
  businessDate,
  currentAssignment,
  onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  room: HousekeepingRoom;
  housekeepers: Housekeeper[];
  propertyId: string;
  businessDate: string;
  currentAssignment: HousekeepingAssignment | null;
  onAssigned: () => void;
}) {
  const { toast } = useToast();
  const [selectedHousekeeper, setSelectedHousekeeper] = useState('');
  const [priority, setPriority] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && currentAssignment) {
      setSelectedHousekeeper(currentAssignment.housekeeperId);
      setPriority(currentAssignment.priority);
    } else if (open) {
      setSelectedHousekeeper('');
      setPriority(0);
    }
  }, [open, currentAssignment]);

  if (!open) return null;

  const active = housekeepers.filter((h) => h.isActive);
  const options = active.map((h) => ({ value: h.id, label: h.name }));

  const handleSave = async () => {
    if (!selectedHousekeeper) return;
    setIsSaving(true);
    try {
      await apiFetch('/api/v1/pms/housekeeping/assign', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          businessDate,
          assignments: [{ roomId: room.roomId, housekeeperId: selectedHousekeeper, priority }],
        }),
      });
      const name = active.find((h) => h.id === selectedHousekeeper)?.name ?? 'housekeeper';
      toast.success(`Assigned ${name} to room ${room.roomNumber}`);
      onAssigned();
      onClose();
    } catch {
      toast.error('Failed to assign housekeeper');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Assign Housekeeper — Room {room.roomNumber}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent/50">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Housekeeper</label>
            {active.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No housekeepers configured for this property.
              </p>
            ) : (
              <Select
                options={options}
                value={selectedHousekeeper}
                onChange={(v) => setSelectedHousekeeper(v as string)}
                placeholder="Select housekeeper..."
                className="mt-1 w-full"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Priority</label>
            <p className="text-xs text-muted-foreground">Lower number = higher priority</p>
            <input
              type="number"
              min={0}
              max={99}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="mt-1 w-20 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedHousekeeper || isSaving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? 'Assigning...' : currentAssignment ? 'Reassign' : 'Assign'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Reason Dialog (shared for Skip + Out of Order) ───────────────

function ReasonDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  title,
  description,
  placeholder,
  confirmLabel,
  confirmColor,
  required,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
  title: string;
  description: string;
  placeholder: string;
  confirmLabel: string;
  confirmColor: string;
  required: boolean;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-400"
          rows={3}
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={(required && !reason.trim()) || isSubmitting}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmColor}`}
          >
            {isSubmitting ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Room Detail Drawer ───────────────────────────────────────────

function RoomDetailDrawer({
  open,
  room,
  assignment,
  onClose,
  onStatusChange,
  onAssign,
  onStartCleaning,
  onCompleteCleaning,
  onSkipCleaning,
  isActioning,
}: {
  open: boolean;
  room: HousekeepingRoom | null;
  assignment: HousekeepingAssignment | null;
  onClose: () => void;
  onStatusChange: (roomId: string, status: string) => void;
  onAssign: () => void;
  onStartCleaning: (assignmentId: string) => void;
  onCompleteCleaning: (assignmentId: string) => void;
  onSkipCleaning: (assignmentId: string) => void;
  isActioning: boolean;
}) {
  if (!open || !room) return null;

  const badge = STATUS_BADGE[room.status] ?? { label: room.status, variant: 'neutral' };
  const transitions = VALID_TRANSITIONS[room.status] ?? [];
  const aBadge = assignment
    ? ASSIGNMENT_BADGE[assignment.status] ?? { label: assignment.status, color: 'bg-muted text-muted-foreground' }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Room {room.roomNumber}</h2>
            <p className="text-sm text-muted-foreground">
              {room.roomTypeName}
              {room.floor ? ` · Floor ${room.floor}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <button onClick={onClose} className="rounded p-1 hover:bg-accent/50">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {/* Guest Information */}
          {(room.currentGuest || room.arrivingGuest) && (
            <section>
              <h3 className="text-sm font-semibold text-foreground">Guest Information</h3>
              {room.currentGuest && (
                <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
                  <User className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{room.currentGuest.name}</p>
                    <p className="text-xs text-muted-foreground">Checkout: {room.currentGuest.checkOutDate}</p>
                    {room.departingToday && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-500">
                        <LogOut className="h-3 w-3" aria-hidden="true" /> Departing today
                      </span>
                    )}
                  </div>
                </div>
              )}
              {room.arrivingGuest && !room.currentGuest && (
                <div className="mt-2 flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                  <LogIn className="mt-0.5 h-4 w-4 text-blue-500" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{room.arrivingGuest.name}</p>
                    <p className="text-xs text-blue-500">Arriving today</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Housekeeping Assignment */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Housekeeping Assignment</h3>
              {assignment && aBadge && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${aBadge.color}`}>
                  {aBadge.label}
                </span>
              )}
            </div>

            {assignment ? (
              <div className="mt-2 space-y-3">
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">{assignment.housekeeperName}</span>
                  </div>
                  {assignment.startedAt && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      Started: {formatTime(assignment.startedAt)}
                    </div>
                  )}
                  {assignment.completedAt && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCheck className="h-3 w-3" aria-hidden="true" />
                      Completed: {formatTime(assignment.completedAt)}
                      {assignment.durationMinutes != null && ` (${assignment.durationMinutes} min)`}
                    </div>
                  )}
                  {assignment.notes && (
                    <p className="mt-2 text-xs italic text-muted-foreground">{assignment.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {assignment.status === 'pending' && (
                    <>
                      <button
                        onClick={() => onStartCleaning(assignment.id)}
                        disabled={isActioning}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" /> Start Cleaning
                      </button>
                      <button
                        onClick={() => onSkipCleaning(assignment.id)}
                        disabled={isActioning}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50 disabled:opacity-50"
                      >
                        <SkipForward className="h-3.5 w-3.5" aria-hidden="true" /> Skip
                      </button>
                    </>
                  )}
                  {assignment.status === 'in_progress' && (
                    <>
                      <button
                        onClick={() => onCompleteCleaning(assignment.id)}
                        disabled={isActioning}
                        className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Complete Cleaning
                      </button>
                      <button
                        onClick={() => onSkipCleaning(assignment.id)}
                        disabled={isActioning}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50 disabled:opacity-50"
                      >
                        <SkipForward className="h-3.5 w-3.5" aria-hidden="true" /> Skip
                      </button>
                    </>
                  )}
                  {(assignment.status === 'completed' || assignment.status === 'skipped') && (
                    <button
                      onClick={onAssign}
                      disabled={isActioning}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50 disabled:opacity-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Reassign
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-muted-foreground">No housekeeper assigned for today.</p>
                <button
                  onClick={onAssign}
                  disabled={isActioning}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Assign Housekeeper
                </button>
              </div>
            )}
          </section>

          {/* Change Room Status */}
          <section>
            <h3 className="text-sm font-semibold text-foreground">Change Room Status</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Current: {STATUS_LABELS[room.status] ?? room.status}
            </p>
            {transitions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {transitions.map((target) => {
                  const isClean = target === 'VACANT_CLEAN';
                  const isOoO = target === 'OUT_OF_ORDER';
                  return (
                    <button
                      key={target}
                      onClick={() => onStatusChange(room.roomId, target)}
                      disabled={isActioning}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                        isClean
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : isOoO
                            ? 'border border-red-500/30 text-red-500 hover:bg-red-500/10'
                            : 'border border-border text-foreground hover:bg-accent/50'
                      }`}
                    >
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      {isClean ? 'Mark Clean' : isOoO ? 'Out of Order' : `Mark ${STATUS_LABELS[target] ?? target}`}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No status transitions available.</p>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Page Component ───────────────────────────────────────────────

export default function HousekeepingContent() {
  const { toast } = useToast();
  const today = useMemo(() => todayISO(), []);

  // ── Core state ─────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rooms, setRooms] = useState<HousekeepingRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState(false);

  // Drawer + assignment state
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<HousekeepingAssignment[]>([]);
  const [housekeepers, setHousekeepers] = useState<Housekeeper[]>([]);

  // Dialog state
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [showOoODialog, setShowOoODialog] = useState(false);
  const [pendingSkipId, setPendingSkipId] = useState<string | null>(null);
  const [pendingOoORoomId, setPendingOoORoomId] = useState<string | null>(null);

  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.roomId === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const selectedAssignment = useMemo(
    () => (selectedRoomId ? assignments.find((a) => a.roomId === selectedRoomId) ?? null : null),
    [assignments, selectedRoomId],
  );

  // ── Load properties ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>('/api/v1/pms/properties');
        if (cancelled) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      } catch {
        // silently handle
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch rooms ─────────────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    if (!selectedPropertyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const qs = buildQueryString({
        propertyId: selectedPropertyId,
        date: today,
        status: statusFilter || undefined,
      });
      const res = await apiFetch<{ data: HousekeepingRoom[] }>(
        `/api/v1/pms/housekeeping/rooms${qs}`,
      );
      setRooms(res.data ?? []);
    } catch {
      toast.error('Failed to load housekeeping rooms');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPropertyId, statusFilter, today, toast]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // ── Fetch assignments ───────────────────────────────────────────
  const fetchAssignments = useCallback(async () => {
    if (!selectedPropertyId) return;
    try {
      const qs = buildQueryString({ propertyId: selectedPropertyId, date: today });
      const res = await apiFetch<{ data: HousekeepingAssignment[] }>(
        `/api/v1/pms/housekeeping/assignments${qs}`,
      );
      setAssignments(res.data ?? []);
    } catch {
      // non-critical
    }
  }, [selectedPropertyId, today]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // ── Load housekeepers once per property ─────────────────────────
  useEffect(() => {
    if (!selectedPropertyId) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: selectedPropertyId });
        const res = await apiFetch<{ data: Housekeeper[] }>(`/api/v1/pms/housekeepers${qs}`);
        if (!cancelled) setHousekeepers(res.data ?? []);
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPropertyId]);

  // ── Auto-refresh every 30s ──────────────────────────────────────
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      fetchRooms();
      fetchAssignments();
    }, 30_000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchRooms, fetchAssignments]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchRooms(), fetchAssignments()]);
  }, [fetchRooms, fetchAssignments]);

  // ── Status change handler ───────────────────────────────────────
  const handleStatusChange = useCallback(
    async (roomId: string, status: string, reason?: string) => {
      if (status === 'OUT_OF_ORDER' && !reason) {
        setPendingOoORoomId(roomId);
        setShowOoODialog(true);
        return;
      }
      setIsActioning(true);
      try {
        await apiFetch(`/api/v1/pms/rooms/${roomId}/status`, {
          method: 'POST',
          body: JSON.stringify({ status, reason }),
        });
        toast.success(`Room updated to ${STATUS_LABELS[status] ?? status}`);
        setRooms((prev) =>
          prev.map((r) =>
            r.roomId === roomId
              ? { ...r, status, isOutOfOrder: status === 'OUT_OF_ORDER' }
              : r,
          ),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update room');
      } finally {
        setIsActioning(false);
      }
    },
    [toast],
  );

  // ── Assignment action handlers ──────────────────────────────────
  const handleStartCleaning = useCallback(
    async (assignmentId: string) => {
      setIsActioning(true);
      try {
        await apiFetch(`/api/v1/pms/housekeeping/assignments/${assignmentId}/start`, {
          method: 'POST',
        });
        toast.success('Cleaning started');
        await refreshAll();
      } catch {
        toast.error('Failed to start cleaning');
      } finally {
        setIsActioning(false);
      }
    },
    [toast, refreshAll],
  );

  const handleCompleteCleaning = useCallback(
    async (assignmentId: string) => {
      setIsActioning(true);
      try {
        await apiFetch(`/api/v1/pms/housekeeping/assignments/${assignmentId}/complete`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        toast.success('Cleaning completed — room marked clean');
        await refreshAll();
      } catch {
        toast.error('Failed to complete cleaning');
      } finally {
        setIsActioning(false);
      }
    },
    [toast, refreshAll],
  );

  const handleSkipCleaning = useCallback((assignmentId: string) => {
    setPendingSkipId(assignmentId);
    setShowSkipDialog(true);
  }, []);

  const confirmSkip = useCallback(
    async (reason: string) => {
      if (!pendingSkipId) return;
      setIsActioning(true);
      try {
        await apiFetch(`/api/v1/pms/housekeeping/assignments/${pendingSkipId}/skip`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason || undefined }),
        });
        toast.success('Cleaning skipped');
        setShowSkipDialog(false);
        setPendingSkipId(null);
        await refreshAll();
      } catch {
        toast.error('Failed to skip cleaning');
      } finally {
        setIsActioning(false);
      }
    },
    [pendingSkipId, toast, refreshAll],
  );

  const confirmOoO = useCallback(
    async (reason: string) => {
      if (!pendingOoORoomId) return;
      setIsActioning(true);
      try {
        await apiFetch(`/api/v1/pms/rooms/${pendingOoORoomId}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: 'OUT_OF_ORDER', reason }),
        });
        toast.success('Room marked out of order');
        setShowOoODialog(false);
        setPendingOoORoomId(null);
        setRooms((prev) =>
          prev.map((r) =>
            r.roomId === pendingOoORoomId
              ? { ...r, status: 'OUT_OF_ORDER', isOutOfOrder: true }
              : r,
          ),
        );
      } catch {
        toast.error('Failed to mark room out of order');
      } finally {
        setIsActioning(false);
      }
    },
    [pendingOoORoomId, toast],
  );

  // ── Quick stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    let clean = 0, dirty = 0, occupied = 0, outOfOrder = 0;
    for (const room of rooms) {
      switch (room.status) {
        case 'VACANT_CLEAN': clean++; break;
        case 'VACANT_DIRTY': dirty++; break;
        case 'OCCUPIED': occupied++; break;
        case 'OUT_OF_ORDER': outOfOrder++; break;
      }
    }
    return { clean, dirty, occupied, outOfOrder };
  }, [rooms]);

  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Housekeeping</h1>
            <p className="text-sm text-muted-foreground">Room status board for {today}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {properties.length > 1 && (
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
              className="w-full sm:w-56"
            />
          )}
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as string)}
            placeholder="All Statuses"
            className="w-full sm:w-48"
          />
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Clean" value={stats.clean} color="bg-green-500/20 text-green-500" />
        <StatCard icon={AlertTriangle} label="Dirty" value={stats.dirty} color="bg-amber-500/20 text-amber-500" />
        <StatCard icon={BedDouble} label="Occupied" value={stats.occupied} color="bg-blue-500/20 text-blue-500" />
        <StatCard icon={Ban} label="Out of Order" value={stats.outOfOrder} color="bg-red-500/20 text-red-500" />
      </div>

      {/* Room Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="h-6 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <BedDouble className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">No rooms found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusFilter ? 'No rooms match the selected filter.' : 'No rooms configured for this property.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rooms.map((room) => (
            <RoomCard
              key={room.roomId}
              room={room}
              isSelected={selectedRoomId === room.roomId}
              onClick={() => setSelectedRoomId(room.roomId)}
            />
          ))}
        </div>
      )}

      {/* Room Detail Drawer */}
      <RoomDetailDrawer
        open={!!selectedRoomId}
        room={selectedRoom}
        assignment={selectedAssignment}
        onClose={() => setSelectedRoomId(null)}
        onStatusChange={handleStatusChange}
        onAssign={() => setShowAssignDialog(true)}
        onStartCleaning={handleStartCleaning}
        onCompleteCleaning={handleCompleteCleaning}
        onSkipCleaning={handleSkipCleaning}
        isActioning={isActioning}
      />

      {/* Assign Housekeeper Dialog */}
      {selectedRoom && (
        <AssignHousekeeperDialog
          open={showAssignDialog}
          onClose={() => setShowAssignDialog(false)}
          room={selectedRoom}
          housekeepers={housekeepers}
          propertyId={selectedPropertyId}
          businessDate={today}
          currentAssignment={selectedAssignment}
          onAssigned={refreshAll}
        />
      )}

      {/* Skip Reason Dialog */}
      <ReasonDialog
        open={showSkipDialog}
        onClose={() => { setShowSkipDialog(false); setPendingSkipId(null); }}
        onConfirm={confirmSkip}
        isSubmitting={isActioning}
        title="Skip Cleaning"
        description="Provide a reason for skipping (optional)."
        placeholder="e.g. Guest declined service, maintenance issue..."
        confirmLabel="Skip Cleaning"
        confirmColor="bg-amber-600 hover:bg-amber-700"
        required={false}
      />

      {/* Out of Order Dialog */}
      <ReasonDialog
        open={showOoODialog}
        onClose={() => { setShowOoODialog(false); setPendingOoORoomId(null); }}
        onConfirm={confirmOoO}
        isSubmitting={isActioning}
        title="Mark Out of Order"
        description="A reason is required for out-of-order rooms."
        placeholder="e.g. Plumbing issue, AC broken, renovation..."
        confirmLabel="Mark Out of Order"
        confirmColor="bg-red-600 hover:bg-red-700"
        required={true}
      />
    </div>
  );
}
