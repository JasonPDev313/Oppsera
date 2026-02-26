'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Mail,
  X,
  Calendar,
  CheckCircle,
  PauseCircle,
  AlertTriangle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface Schedule {
  id: string;
  name: string;
  reportType: string;
  frequency: string;
  deliveryHour: number;
  channel: string;
  isActive: boolean;
  lastDeliveredAt?: string;
  nextDeliveryAt?: string;
}

interface ScheduleFormInput {
  name: string;
  reportType: string;
  frequency: string;
  deliveryHour: number;
  channel: string;
  recipients: string;
}

interface ScheduledReportsPanelProps {
  schedules: Schedule[];
  onCreate: (input: ScheduleFormInput) => void;
  onUpdate: (id: string, input: ScheduleFormInput) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'daily_sales', label: 'Daily Sales Summary' },
  { value: 'weekly_sales', label: 'Weekly Sales Report' },
  { value: 'inventory', label: 'Inventory Summary' },
  { value: 'customer_activity', label: 'Customer Activity' },
  { value: 'financial_summary', label: 'Financial Summary' },
  { value: 'custom', label: 'Custom Report' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'slack', label: 'Slack' },
  { value: 'webhook', label: 'Webhook' },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00`,
}));

// ── Helpers ────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getCountdown(nextDeliveryAt: string): string {
  const now = Date.now();
  const next = new Date(nextDeliveryAt).getTime();
  const diff = next - now;

  if (diff <= 0) return 'Overdue';
  if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.ceil(diff / 3_600_000)}h`;
  return `${Math.ceil(diff / 86_400_000)}d`;
}

function isOverdue(schedule: Schedule): boolean {
  if (!schedule.lastDeliveredAt || !schedule.nextDeliveryAt || !schedule.isActive) return false;
  return new Date(schedule.nextDeliveryAt).getTime() < Date.now();
}

// ── Component ──────────────────────────────────────────────────────

export function ScheduledReportsPanel({
  schedules,
  onCreate,
  onUpdate,
  onDelete,
  onToggle,
  className,
}: ScheduledReportsPanelProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const handleOpenCreate = useCallback(() => {
    setEditingSchedule(null);
    setShowDialog(true);
  }, []);

  const handleOpenEdit = useCallback((schedule: Schedule) => {
    setEditingSchedule(schedule);
    setShowDialog(true);
  }, []);

  const handleSubmit = useCallback(
    (input: ScheduleFormInput) => {
      if (editingSchedule) {
        onUpdate(editingSchedule.id, input);
      } else {
        onCreate(input);
      }
      setShowDialog(false);
      setEditingSchedule(null);
    },
    [editingSchedule, onCreate, onUpdate],
  );

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Scheduled Reports</h3>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New Schedule
        </button>
      </div>

      {/* Schedule list */}
      <div className="divide-y divide-border">
        {schedules.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Clock className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No scheduled reports</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set up automated report delivery to keep your team informed
            </p>
          </div>
        )}

        {schedules.map((schedule) => {
          const overdue = isOverdue(schedule);
          const reportLabel =
            REPORT_TYPES.find((t) => t.value === schedule.reportType)?.label ??
            schedule.reportType;

          return (
            <div key={schedule.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Name + status */}
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {schedule.name}
                    </p>

                    {/* Status indicator */}
                    {schedule.isActive ? (
                      overdue ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500">
                          <CheckCircle className="h-2.5 w-2.5" />
                          Active
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                        <PauseCircle className="h-2.5 w-2.5" />
                        Paused
                      </span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{reportLabel}</span>
                    <span>&middot;</span>
                    <span className="capitalize">{schedule.frequency}</span>
                    <span>&middot;</span>
                    <span>{HOUR_OPTIONS[schedule.deliveryHour]?.label ?? `${schedule.deliveryHour}:00`}</span>
                    <span>&middot;</span>
                    <span className="inline-flex items-center gap-0.5 capitalize">
                      <Mail className="h-2.5 w-2.5" />
                      {schedule.channel}
                    </span>
                  </div>

                  {/* Last/Next delivery */}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    {schedule.lastDeliveredAt && (
                      <span>Last: {formatDateTime(schedule.lastDeliveredAt)}</span>
                    )}
                    {schedule.nextDeliveryAt && schedule.isActive && (
                      <span className={overdue ? 'text-amber-600 font-medium' : ''}>
                        Next: {getCountdown(schedule.nextDeliveryAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => onToggle(schedule.id, !schedule.isActive)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      schedule.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                    title={schedule.isActive ? 'Pause' : 'Activate'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                        schedule.isActive ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(schedule)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(schedule.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Form dialog (portal) */}
      {showDialog &&
        typeof document !== 'undefined' &&
        createPortal(
          <ScheduleFormDialog
            initial={editingSchedule}
            onClose={() => {
              setShowDialog(false);
              setEditingSchedule(null);
            }}
            onSubmit={handleSubmit}
          />,
          document.body,
        )}
    </div>
  );
}

// ── Schedule Form Dialog ───────────────────────────────────────────

function ScheduleFormDialog({
  initial,
  onClose,
  onSubmit,
}: {
  initial: Schedule | null;
  onClose: () => void;
  onSubmit: (input: ScheduleFormInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [reportType, setReportType] = useState(initial?.reportType ?? REPORT_TYPES[0]!.value);
  const [frequency, setFrequency] = useState(initial?.frequency ?? FREQUENCY_OPTIONS[0]!.value);
  const [deliveryHour, setDeliveryHour] = useState(initial?.deliveryHour ?? 8);
  const [channel, setChannel] = useState(initial?.channel ?? CHANNEL_OPTIONS[0]!.value);
  const [recipients, setRecipients] = useState('');

  const canSubmit = name.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (canSubmit) {
      onSubmit({
        name: name.trim(),
        reportType,
        frequency,
        deliveryHour,
        channel,
        recipients: recipients.trim(),
      });
    }
  }, [canSubmit, onSubmit, name, reportType, frequency, deliveryHour, channel, recipients]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {initial ? 'Edit Schedule' : 'New Schedule'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Schedule Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Weekly Sales Summary"
            maxLength={100}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        {/* Report type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Report Type
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Frequency + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Delivery Time
            </label>
            <select
              value={deliveryHour}
              onChange={(e) => setDeliveryHour(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Channel */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Delivery Channel
          </label>
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            {CHANNEL_OPTIONS.map((ch) => (
              <button
                key={ch.value}
                type="button"
                onClick={() => setChannel(ch.value)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  channel === ch.value
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recipients */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Recipients
          </label>
          <input
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="email@example.com, another@example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Comma-separated email addresses or channel names
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {initial ? 'Update Schedule' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
