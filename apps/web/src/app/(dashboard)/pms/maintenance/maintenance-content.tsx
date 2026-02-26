'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Wrench,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  Loader2,
  X,
  CalendarDays,
  User,
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

interface Room {
  id: string;
  roomNumber: string;
}

interface WorkOrder {
  id: string;
  propertyId: string;
  title: string;
  description: string | null;
  roomId: string | null;
  roomNumber: string | null;
  category: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  estimatedHours: number | null;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'general', label: 'General' },
];

const CATEGORY_FORM_OPTIONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'general', label: 'General' },
];

const PRIORITY_FORM_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const PRIORITY_BADGES: Record<string, { label: string; variant: string }> = {
  urgent: { label: 'Urgent', variant: 'error' },
  high: { label: 'High', variant: 'orange' },
  medium: { label: 'Medium', variant: 'info' },
  low: { label: 'Low', variant: 'neutral' },
};

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  open: { label: 'Open', variant: 'info' },
  in_progress: { label: 'In Progress', variant: 'warning' },
  on_hold: { label: 'On Hold', variant: 'neutral' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'error' },
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  open: AlertTriangle,
  in_progress: Clock,
  on_hold: Pause,
  completed: CheckCircle,
  cancelled: XCircle,
};

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    hvac: 'HVAC',
    furniture: 'Furniture',
    general: 'General',
  };
  return labels[cat] ?? cat;
}

// ── Create Work Order Dialog ─────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  rooms: Room[];
  onCreated: () => void;
}

function CreateWorkOrderDialog({ open, onClose, propertyId, rooms, onCreated }: CreateDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [dueDate, setDueDate] = useState('');

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setRoomId('');
    setCategory('general');
    setPriority('medium');
    setAssignedTo('');
    setEstimatedHours('');
    setDueDate('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setIsSaving(true);
    try {
      await apiFetch('/api/v1/pms/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          title: title.trim(),
          description: description.trim() || null,
          roomId: roomId || null,
          category,
          priority,
          assignedTo: assignedTo.trim() || null,
          estimatedHours: estimatedHours ? Number(estimatedHours) : null,
          dueDate: dueDate || null,
        }),
      });
      toast.success('Work order created');
      resetForm();
      onClose();
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create work order';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [propertyId, title, description, roomId, category, priority, assignedTo, estimatedHours, dueDate, toast, resetForm, onClose, onCreated]);

  const roomOptions = useMemo(
    () => [
      { value: '', label: 'Common Area (no room)' },
      ...rooms.map((r) => ({ value: r.id, label: `Room ${r.roomNumber}` })),
    ],
    [rooms],
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Create Work Order</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Leaking faucet in Room 204"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the issue..."
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Room */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Room</label>
            <Select
              options={roomOptions}
              value={roomId}
              onChange={(v) => setRoomId(v as string)}
              placeholder="Select room (optional)"
              className="w-full"
            />
          </div>

          {/* Category + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Category</label>
              <Select
                options={CATEGORY_FORM_OPTIONS}
                value={category}
                onChange={(v) => setCategory(v as string)}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Priority</label>
              <Select
                options={PRIORITY_FORM_OPTIONS}
                value={priority}
                onChange={(v) => setPriority(v as string)}
                className="w-full"
              />
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Assigned To</label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Name of assignee"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Estimated Hours + Due Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Estimated Hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="e.g. 2"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !title.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Work Order
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Work Order Card ──────────────────────────────────────────────

function WorkOrderCard({
  order,
  onComplete,
  isCompleting,
}: {
  order: WorkOrder;
  onComplete: (id: string) => void;
  isCompleting: boolean;
}) {
  const priorityBadge = PRIORITY_BADGES[order.priority] ?? { label: order.priority, variant: 'neutral' };
  const statusBadge = STATUS_BADGES[order.status] ?? { label: order.status, variant: 'neutral' };
  const StatusIcon = STATUS_ICONS[order.status] ?? AlertTriangle;

  const canComplete = order.status === 'open' || order.status === 'in_progress';
  const isOverdue =
    order.dueDate &&
    order.status !== 'completed' &&
    order.status !== 'cancelled' &&
    new Date(order.dueDate) < new Date();

  return (
    <div className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-muted-foreground">
      {/* Top row: title + priority */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <StatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground line-clamp-2">{order.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant={priorityBadge.variant}>{priorityBadge.label}</Badge>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </div>
      </div>

      {/* Details row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {/* Room or Common Area */}
        <span className="flex items-center gap-1">
          <Wrench className="h-3 w-3" />
          {order.roomNumber ? `Room ${order.roomNumber}` : 'Common Area'}
        </span>

        {/* Category */}
        <span>{categoryLabel(order.category)}</span>

        {/* Assigned To */}
        {order.assignedTo && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {order.assignedTo}
          </span>
        )}

        {/* Due date */}
        {order.dueDate && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'font-medium text-red-500' : ''}`}>
            <CalendarDays className="h-3 w-3" />
            Due {formatDate(order.dueDate)}
            {isOverdue && ' (overdue)'}
          </span>
        )}

        {/* Created */}
        <span className="text-muted-foreground">Created {formatDate(order.createdAt)}</span>
      </div>

      {/* Description preview */}
      {order.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{order.description}</p>
      )}

      {/* Actions */}
      {canComplete && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => onComplete(order.id)}
            disabled={isCompleting}
            className="flex items-center gap-1.5 rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/10 disabled:opacity-50"
          >
            {isCompleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            Complete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page Component ───────────────────────────────────────────────

export default function MaintenanceContent() {
  const { toast } = useToast();

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // ── Load properties ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: Property[] }>('/api/v1/pms/properties')
      .then((res) => {
        if (cancelled) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      })
      .catch(() => {
        /* silently handle */
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // ── Load rooms for the create dialog ──────────────────────────────
  useEffect(() => {
    if (!selectedPropertyId) return;
    let cancelled = false;
    apiFetch<{ data: Room[] }>(
      `/api/v1/pms/rooms${buildQueryString({ propertyId: selectedPropertyId, limit: 500 })}`,
    )
      .then((res) => {
        if (!cancelled) setRooms(res.data ?? []);
      })
      .catch(() => {
        /* silently handle */
      });
    return () => { cancelled = true; };
  }, [selectedPropertyId]);

  // ── Debounced search ──────────────────────────────────────────────
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
    }, 300);
  }, []);

  // ── Fetch work orders ─────────────────────────────────────────────
  const fetchWorkOrders = useCallback(
    async (append = false) => {
      if (!selectedPropertyId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const qs = buildQueryString({
          propertyId: selectedPropertyId,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          category: categoryFilter || undefined,
          q: searchTerm || undefined,
          cursor: append ? cursor : undefined,
          limit: 20,
        });
        const res = await apiFetch<{
          data: WorkOrder[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/pms/work-orders${qs}`);

        if (append) {
          setWorkOrders((prev) => [...prev, ...res.data]);
        } else {
          setWorkOrders(res.data);
        }
        setCursor(res.meta.cursor);
        setHasMore(res.meta.hasMore);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        toast.error('Failed to load work orders');
      } finally {
        setIsLoading(false);
      }
    },
    [selectedPropertyId, statusFilter, priorityFilter, categoryFilter, searchTerm, cursor, toast],
  );

  // Re-fetch when filters change (reset cursor)
  useEffect(() => {
    if (!selectedPropertyId) return;
    setCursor(null);
    setHasMore(false);
    fetchWorkOrders(false);
  }, [selectedPropertyId, statusFilter, priorityFilter, categoryFilter, searchTerm]); // eslint-disable-line

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchWorkOrders(true);
    }
  }, [hasMore, isLoading, fetchWorkOrders]);

  // ── Complete work order ───────────────────────────────────────────
  const handleComplete = useCallback(
    async (id: string) => {
      setCompletingId(id);
      try {
        await apiFetch(`/api/v1/pms/work-orders/${id}/complete`, {
          method: 'POST',
        });
        toast.success('Work order completed');
        // Optimistic update
        setWorkOrders((prev) =>
          prev.map((wo) =>
            wo.id === id
              ? { ...wo, status: 'completed', completedAt: new Date().toISOString() }
              : wo,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to complete work order';
        toast.error(msg);
      } finally {
        setCompletingId(null);
      }
    },
    [toast],
  );

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let overdue = 0;
    let completedThisWeek = 0;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const wo of workOrders) {
      if (wo.status === 'open') open++;
      if (wo.status === 'in_progress') inProgress++;
      if (
        wo.dueDate &&
        wo.status !== 'completed' &&
        wo.status !== 'cancelled' &&
        new Date(wo.dueDate) < now
      ) {
        overdue++;
      }
      if (wo.status === 'completed' && wo.completedAt && new Date(wo.completedAt) > weekAgo) {
        completedThisWeek++;
      }
    }
    return { open, inProgress, overdue, completedThisWeek };
  }, [workOrders]);

  // ── Property options for the selector ─────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20 text-orange-500">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Maintenance</h1>
            <p className="text-sm text-muted-foreground">Work orders and maintenance requests</p>
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
          <button
            onClick={() => setShowCreateDialog(true)}
            disabled={!selectedPropertyId}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create Work Order
          </button>
        </div>
      </div>

      {/* ── Quick Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">Open</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{stats.open}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">In Progress</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{stats.inProgress}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-500">
              <XCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">Overdue</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{stats.overdue}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/20 text-green-500">
              <CheckCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">Completed (7d)</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{stats.completedThisWeek}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search work orders..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/30 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as string)}
            placeholder="All Statuses"
            className="w-36"
          />
          <Select
            options={PRIORITY_OPTIONS}
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as string)}
            placeholder="All Priorities"
            className="w-36"
          />
          <Select
            options={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v as string)}
            placeholder="All Categories"
            className="w-40"
          />
        </div>
      </div>

      {/* ── Work Order List ────────────────────────────────────────── */}
      {isLoading && workOrders.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
              <div className="mt-3 flex gap-4">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : workOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <Wrench className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">No work orders found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm || statusFilter || priorityFilter || categoryFilter
              ? 'No work orders match the current filters.'
              : 'Create your first work order to get started.'}
          </p>
          {!searchTerm && !statusFilter && !priorityFilter && !categoryFilter && selectedPropertyId && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Create Work Order
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {workOrders.map((wo) => (
            <WorkOrderCard
              key={wo.id}
              order={wo}
              onComplete={handleComplete}
              isCompleting={completingId === wo.id}
            />
          ))}
        </div>
      )}

      {/* ── Loading indicator ──────────────────────────────────────── */}
      {isLoading && workOrders.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Load more ──────────────────────────────────────────────── */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent/50"
          >
            Load more
          </button>
        </div>
      )}

      {/* ── Create Dialog ──────────────────────────────────────────── */}
      <CreateWorkOrderDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        propertyId={selectedPropertyId}
        rooms={rooms}
        onCreated={() => {
          setCursor(null);
          setHasMore(false);
          fetchWorkOrders(false);
        }}
      />
    </div>
  );
}
