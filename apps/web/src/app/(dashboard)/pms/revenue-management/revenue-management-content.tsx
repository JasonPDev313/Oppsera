'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp,
  Plus,
  DollarSign,
  Calendar,
  X,
  Loader2,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  ToggleLeft,
  ToggleRight,
  Pencil,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface RoomType {
  id: string;
  name: string;
  code: string;
}

type RuleType = 'occupancy_threshold' | 'day_of_week' | 'lead_time' | 'seasonal' | 'event';
type AdjustmentType = 'percentage' | 'fixed';
type AdjustmentDirection = 'increase' | 'decrease';

interface PricingConditions {
  occupancyAbovePct?: number;
  occupancyBelowPct?: number;
  daysOfWeek?: number[];
  leadTimeDaysMin?: number;
  leadTimeDaysMax?: number;
  dateRanges?: Array<{ startDate: string; endDate: string }>;
  roomTypeIds?: string[];
  eventName?: string;
}

interface PricingAdjustments {
  type: AdjustmentType;
  amount: number;
  direction: AdjustmentDirection;
}

interface PricingRule {
  id: string;
  propertyId: string;
  name: string;
  ruleType: RuleType;
  priority: number;
  isActive: boolean;
  conditions: PricingConditions;
  adjustments: PricingAdjustments;
  floorCents: number | null;
  ceilingCents: number | null;
  createdAt: string;
  updatedAt: string;
}

interface PricingPreviewDay {
  date: string;
  baseCents: number;
  adjustedCents: number;
  rulesApplied: string[];
}

// ── Constants ────────────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  occupancy_threshold: 'Occupancy Threshold',
  day_of_week: 'Day of Week',
  lead_time: 'Lead Time',
  seasonal: 'Seasonal',
  event: 'Event',
};

const RULE_TYPE_OPTIONS = Object.entries(RULE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ──────────────────────────────────────────────────────

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '\u2014';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatAdjustmentSummary(adj: PricingAdjustments): string {
  const sign = adj.direction === 'increase' ? '+' : '-';
  if (adj.type === 'percentage') {
    return `${sign}${adj.amount}%`;
  }
  return `${sign}$${(adj.amount / 100).toFixed(2)}`;
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getCalendarCellColor(baseCents: number, adjustedCents: number): string {
  if (adjustedCents < baseCents) return 'bg-green-500/10 border-green-500/30 text-green-500';
  if (adjustedCents > baseCents) return 'bg-red-500/10 border-red-500/30 text-red-500';
  return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500';
}

// ── Page Component ───────────────────────────────────────────────

type PricingRuleRow = PricingRule & Record<string, unknown>;

export default function RevenueManagementContent() {
  // ── Shared state ─────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  // ── Rules state ──────────────────────────────────────────────────
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Dialog state ─────────────────────────────────────────────────
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [formName, setFormName] = useState('');
  const [formRuleType, setFormRuleType] = useState<RuleType>('occupancy_threshold');
  const [formPriority, setFormPriority] = useState('0');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formAdjType, setFormAdjType] = useState<AdjustmentType>('percentage');
  const [formAdjAmount, setFormAdjAmount] = useState('');
  const [formAdjDirection, setFormAdjDirection] = useState<AdjustmentDirection>('increase');
  const [formFloor, setFormFloor] = useState('');
  const [formCeiling, setFormCeiling] = useState('');
  // Condition fields
  const [formOccupancyPct, setFormOccupancyPct] = useState('');
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[]>([]);
  const [formLeadTimeDays, setFormLeadTimeDays] = useState('');
  const [formSeasonStart, setFormSeasonStart] = useState('');
  const [formSeasonEnd, setFormSeasonEnd] = useState('');
  const [formEventName, setFormEventName] = useState('');
  const [formEventStart, setFormEventStart] = useState('');
  const [formEventEnd, setFormEventEnd] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Calendar state ───────────────────────────────────────────────
  const [calendarRoomTypeId, setCalendarRoomTypeId] = useState('');
  const [calendarData, setCalendarData] = useState<PricingPreviewDay[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // ── Load properties ──────────────────────────────────────────────
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

  // ── Load room types ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPropertyId) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: selectedPropertyId });
        const res = await apiFetch<{ data: RoomType[] }>(`/api/v1/pms/room-types${qs}`);
        if (cancelled) return;
        const items = res.data ?? [];
        setRoomTypes(items);
        if (items.length > 0) {
          setCalendarRoomTypeId(items[0]!.id);
        }
      } catch {
        // silently handle
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPropertyId]);

  // ── Load pricing rules ───────────────────────────────────────────
  const fetchRules = useCallback(async () => {
    if (!selectedPropertyId) {
      setIsLoadingRules(false);
      return;
    }
    setIsLoadingRules(true);
    try {
      const qs = buildQueryString({ propertyId: selectedPropertyId });
      const res = await apiFetch<{ data: PricingRule[] }>(`/api/v1/pms/pricing-rules${qs}`);
      setRules(res.data ?? []);
    } catch {
      // silently handle
    } finally {
      setIsLoadingRules(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    setRules([]);
    fetchRules();
  }, [selectedPropertyId]);

  // ── Load calendar preview ────────────────────────────────────────
  const fetchCalendar = useCallback(async () => {
    if (!selectedPropertyId) return;
    setIsLoadingCalendar(true);
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 29);
    try {
      const qs = buildQueryString({
        propertyId: selectedPropertyId,
        roomTypeId: calendarRoomTypeId || undefined,
        startDate: formatDateInput(today),
        endDate: formatDateInput(endDate),
      });
      const res = await apiFetch<{ data: PricingPreviewDay[] }>(
        `/api/v1/pms/pricing-rules/preview${qs}`,
      );
      setCalendarData(res.data ?? []);
    } catch {
      setCalendarData([]);
    } finally {
      setIsLoadingCalendar(false);
    }
  }, [selectedPropertyId, calendarRoomTypeId]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // ── Toggle active ────────────────────────────────────────────────
  const handleToggleActive = useCallback(
    async (rule: PricingRule) => {
      setTogglingId(rule.id);
      try {
        await apiFetch(`/api/v1/pms/pricing-rules/${rule.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !rule.isActive }),
        });
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)),
        );
        fetchCalendar();
      } catch {
        // silently handle
      } finally {
        setTogglingId(null);
      }
    },
    [fetchCalendar],
  );

  // ── Dialog helpers ───────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setFormName('');
    setFormRuleType('occupancy_threshold');
    setFormPriority('0');
    setFormIsActive(true);
    setFormAdjType('percentage');
    setFormAdjAmount('');
    setFormAdjDirection('increase');
    setFormFloor('');
    setFormCeiling('');
    setFormOccupancyPct('');
    setFormDaysOfWeek([]);
    setFormLeadTimeDays('');
    setFormSeasonStart('');
    setFormSeasonEnd('');
    setFormEventName('');
    setFormEventStart('');
    setFormEventEnd('');
    setFormError(null);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setEditingRule(null);
    setDialogMode('create');
  }, [resetForm]);

  const openEdit = useCallback((rule: PricingRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormRuleType(rule.ruleType);
    setFormPriority(String(rule.priority));
    setFormIsActive(rule.isActive);
    setFormAdjType(rule.adjustments.type);
    setFormAdjAmount(
      rule.adjustments.type === 'fixed'
        ? (rule.adjustments.amount / 100).toFixed(2)
        : String(rule.adjustments.amount),
    );
    setFormAdjDirection(rule.adjustments.direction);
    setFormFloor(rule.floorCents != null ? (rule.floorCents / 100).toFixed(2) : '');
    setFormCeiling(rule.ceilingCents != null ? (rule.ceilingCents / 100).toFixed(2) : '');
    setFormOccupancyPct(
      rule.conditions.occupancyAbovePct != null ? String(rule.conditions.occupancyAbovePct) : '',
    );
    setFormDaysOfWeek(rule.conditions.daysOfWeek ?? []);
    setFormLeadTimeDays(
      rule.conditions.leadTimeDaysMax != null ? String(rule.conditions.leadTimeDaysMax) : '',
    );
    const dateRange = rule.conditions.dateRanges?.[0];
    if (rule.ruleType === 'seasonal' && dateRange) {
      setFormSeasonStart(dateRange.startDate);
      setFormSeasonEnd(dateRange.endDate);
    } else {
      setFormSeasonStart('');
      setFormSeasonEnd('');
    }
    if (rule.ruleType === 'event' && dateRange) {
      setFormEventName(rule.conditions.eventName ?? '');
      setFormEventStart(dateRange.startDate);
      setFormEventEnd(dateRange.endDate);
    } else {
      setFormEventName('');
      setFormEventStart('');
      setFormEventEnd('');
    }
    setFormError(null);
    setDialogMode('edit');
  }, []);

  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingRule(null);
  }, []);

  const buildConditions = useCallback((): PricingConditions => {
    const conditions: PricingConditions = {};
    switch (formRuleType) {
      case 'occupancy_threshold':
        if (formOccupancyPct) conditions.occupancyAbovePct = Number(formOccupancyPct);
        break;
      case 'day_of_week':
        if (formDaysOfWeek.length > 0) conditions.daysOfWeek = formDaysOfWeek;
        break;
      case 'lead_time':
        if (formLeadTimeDays) conditions.leadTimeDaysMax = Number(formLeadTimeDays);
        break;
      case 'seasonal':
        if (formSeasonStart && formSeasonEnd) {
          conditions.dateRanges = [{ startDate: formSeasonStart, endDate: formSeasonEnd }];
        }
        break;
      case 'event':
        if (formEventStart && formEventEnd) {
          conditions.dateRanges = [{ startDate: formEventStart, endDate: formEventEnd }];
        }
        if (formEventName) conditions.eventName = formEventName;
        break;
    }
    return conditions;
  }, [formRuleType, formOccupancyPct, formDaysOfWeek, formLeadTimeDays, formSeasonStart, formSeasonEnd, formEventStart, formEventEnd, formEventName]);

  const buildAdjustments = useCallback((): PricingAdjustments => {
    const rawAmount = parseFloat(formAdjAmount) || 0;
    return {
      type: formAdjType,
      amount: formAdjType === 'fixed' ? Math.round(rawAmount * 100) : rawAmount,
      direction: formAdjDirection,
    };
  }, [formAdjType, formAdjAmount, formAdjDirection]);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formAdjAmount || parseFloat(formAdjAmount) <= 0) {
      setFormError('Adjustment amount must be greater than 0');
      return;
    }

    const propId = selectedPropertyId || properties[0]?.id;
    if (!propId) {
      setFormError('No property available');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        ruleType: formRuleType,
        priority: parseInt(formPriority, 10) || 0,
        isActive: formIsActive,
        conditions: buildConditions(),
        adjustments: buildAdjustments(),
      };

      if (formFloor && parseFloat(formFloor) > 0) {
        payload.floorCents = Math.round(parseFloat(formFloor) * 100);
      } else if (dialogMode === 'edit') {
        payload.floorCents = null;
      }

      if (formCeiling && parseFloat(formCeiling) > 0) {
        payload.ceilingCents = Math.round(parseFloat(formCeiling) * 100);
      } else if (dialogMode === 'edit') {
        payload.ceilingCents = null;
      }

      if (dialogMode === 'create') {
        payload.propertyId = propId;
        await apiFetch('/api/v1/pms/pricing-rules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else if (dialogMode === 'edit' && editingRule) {
        await apiFetch(`/api/v1/pms/pricing-rules/${editingRule.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }

      closeDialog();
      fetchRules();
      fetchCalendar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save pricing rule';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formName, formRuleType, formPriority, formIsActive, formAdjAmount, formFloor, formCeiling,
    selectedPropertyId, properties, dialogMode, editingRule,
    buildConditions, buildAdjustments, closeDialog, fetchRules, fetchCalendar,
  ]);

  // ── Property + room type options ─────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  const roomTypeOptions = useMemo(
    () => roomTypes.map((rt) => ({ value: rt.id, label: `${rt.name} (${rt.code})` })),
    [roomTypes],
  );

  // ── Table columns ────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Rule Name',
        render: (row: PricingRuleRow) => {
          const rule = row as unknown as PricingRule;
          return (
            <span className="text-sm font-medium text-foreground">{rule.name}</span>
          );
        },
      },
      {
        key: 'ruleType',
        header: 'Type',
        width: '160px',
        render: (row: PricingRuleRow) => {
          const rule = row as unknown as PricingRule;
          return (
            <Badge variant="indigo">
              {RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}
            </Badge>
          );
        },
      },
      {
        key: 'priority',
        header: 'Priority',
        width: '80px',
        render: (row: PricingRuleRow) => (
          <span className="text-sm text-foreground">{(row as unknown as PricingRule).priority}</span>
        ),
      },
      {
        key: 'adjustment',
        header: 'Adjustment',
        width: '120px',
        render: (row: PricingRuleRow) => {
          const rule = row as unknown as PricingRule;
          const isUp = rule.adjustments.direction === 'increase';
          return (
            <span className={`inline-flex items-center gap-1 text-sm font-medium ${isUp ? 'text-red-500' : 'text-green-500'}`}>
              {isUp
                ? <ArrowUpRight className="h-3.5 w-3.5" />
                : <ArrowDownRight className="h-3.5 w-3.5" />}
              {formatAdjustmentSummary(rule.adjustments)}
            </span>
          );
        },
      },
      {
        key: 'floorCeiling',
        header: 'Floor / Ceiling',
        width: '140px',
        render: (row: PricingRuleRow) => {
          const rule = row as unknown as PricingRule;
          return (
            <span className="text-sm text-muted-foreground">
              {formatCents(rule.floorCents)} / {formatCents(rule.ceilingCents)}
            </span>
          );
        },
      },
      {
        key: 'isActive',
        header: 'Status',
        width: '100px',
        render: (row: PricingRuleRow) => {
          const rule = row as unknown as PricingRule;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleActive(rule);
              }}
              disabled={togglingId === rule.id}
              className="inline-flex items-center gap-1.5 text-sm"
              title={rule.isActive ? 'Click to deactivate' : 'Click to activate'}
            >
              {togglingId === rule.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : rule.isActive ? (
                <ToggleRight className="h-5 w-5 text-green-500" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
              )}
              <span className={rule.isActive ? 'text-green-500' : 'text-muted-foreground'}>
                {rule.isActive ? 'Active' : 'Inactive'}
              </span>
            </button>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        width: '50px',
        render: (row: PricingRuleRow) => {
          const rule = row as unknown as PricingRule;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(rule);
              }}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-gray-200/50 hover:text-muted-foreground"
              title="Edit rule"
            >
              <Pencil className="h-4 w-4" />
            </button>
          );
        },
      },
    ],
    [handleToggleActive, togglingId, openEdit],
  );

  // ── Toggle day of week ───────────────────────────────────────────
  const toggleDay = useCallback((day: number) => {
    setFormDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }, []);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Revenue Management</h1>
            <p className="text-sm text-muted-foreground">Configure pricing rules and preview yield adjustments</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
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
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Rule
          </button>
        </div>
      </div>

      {/* ── Pricing Rules Section ──────────────────────────────────── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Zap className="h-5 w-5 text-indigo-500" />
          Pricing Rules
        </h2>

        {!isLoadingRules && rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
            <DollarSign className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-sm font-semibold text-foreground">No pricing rules</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create rules to automatically adjust rates based on occupancy, day of week, and more.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Create First Rule
            </button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rules as PricingRuleRow[]}
            isLoading={isLoadingRules}
            emptyMessage="No pricing rules found"
          />
        )}
      </section>

      {/* ── Pricing Calendar Section ───────────────────────────────── */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Calendar className="h-5 w-5 text-indigo-500" />
            Pricing Calendar
            <span className="text-sm font-normal text-muted-foreground">(30-day preview)</span>
          </h2>
          {roomTypes.length > 0 && (
            <Select
              options={roomTypeOptions}
              value={calendarRoomTypeId}
              onChange={(v) => setCalendarRoomTypeId(v as string)}
              placeholder="All room types"
              className="w-full sm:w-56"
            />
          )}
        </div>

        {/* Legend */}
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-green-500/30 bg-green-500/10" />
            Below base (discounted)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-yellow-500/30 bg-yellow-500/10" />
            At base rate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-red-500/30 bg-red-500/10" />
            Above base (premium)
          </span>
        </div>

        {isLoadingCalendar ? (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-7 xl:grid-cols-10">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-border bg-muted"
              />
            ))}
          </div>
        ) : calendarData.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-12">
            <Calendar className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No pricing data available. Set base rates on your rate plans first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-7 xl:grid-cols-10">
            {calendarData.map((day) => {
              const cellColor = getCalendarCellColor(day.baseCents, day.adjustedCents);
              const changed = day.baseCents !== day.adjustedCents;
              return (
                <div
                  key={day.date}
                  className={`flex flex-col items-center rounded-lg border p-2 text-center ${cellColor}`}
                  title={
                    day.rulesApplied.length > 0
                      ? `Rules: ${day.rulesApplied.join(', ')}`
                      : 'No rules applied'
                  }
                >
                  <span className="text-[10px] font-medium uppercase opacity-70">
                    {formatDateShort(day.date)}
                  </span>
                  {changed && (
                    <span className="mt-0.5 text-[10px] line-through opacity-50">
                      {formatCents(day.baseCents)}
                    </span>
                  )}
                  <span className="mt-0.5 text-sm font-bold">
                    {formatCents(day.adjustedCents)}
                  </span>
                  {day.rulesApplied.length > 0 && (
                    <span className="mt-0.5 text-[9px] opacity-60">
                      {day.rulesApplied.length} rule{day.rulesApplied.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Create / Edit Dialog ───────────────────────────────────── */}
      {dialogMode &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={closeDialog} />
            <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  {dialogMode === 'create' ? 'Create Pricing Rule' : 'Edit Pricing Rule'}
                </h2>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded p-1 text-muted-foreground hover:bg-gray-200/50 hover:text-muted-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Weekend Premium, High Occupancy Surge"
                    maxLength={200}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>

                {/* Rule Type */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Rule Type
                  </label>
                  <Select
                    options={RULE_TYPE_OPTIONS}
                    value={formRuleType}
                    onChange={(v) => setFormRuleType(v as RuleType)}
                    className="w-full"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Priority
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Higher priority rules are applied first (0 = lowest)
                  </p>
                </div>

                {/* Active toggle */}
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-indigo-500 focus:ring-indigo-500"
                  />
                  Rule is active
                </label>

                {/* ── Condition Fields (type-specific) ───────────────── */}
                <fieldset className="rounded-lg border border-border p-4">
                  <legend className="px-1 text-sm font-medium text-foreground">Conditions</legend>

                  {formRuleType === 'occupancy_threshold' && (
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">
                        When occupancy is above (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={formOccupancyPct}
                          onChange={(e) => setFormOccupancyPct(e.target.value)}
                          placeholder="e.g. 80"
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {formRuleType === 'day_of_week' && (
                    <div>
                      <label className="mb-2 block text-sm text-muted-foreground">
                        Apply on these days
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map((label, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDay(idx)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              formDaysOfWeek.includes(idx)
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-border bg-surface text-foreground hover:bg-gray-200/50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {formRuleType === 'lead_time' && (
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">
                        Within X days of arrival
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={formLeadTimeDays}
                        onChange={(e) => setFormLeadTimeDays(e.target.value)}
                        placeholder="e.g. 7"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  {formRuleType === 'seasonal' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-sm text-muted-foreground">Start Date</label>
                        <input
                          type="date"
                          value={formSeasonStart}
                          onChange={(e) => setFormSeasonStart(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-muted-foreground">End Date</label>
                        <input
                          type="date"
                          value={formSeasonEnd}
                          onChange={(e) => setFormSeasonEnd(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  )}

                  {formRuleType === 'event' && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm text-muted-foreground">Event Name</label>
                        <input
                          type="text"
                          value={formEventName}
                          onChange={(e) => setFormEventName(e.target.value)}
                          placeholder="e.g. Local Marathon, Music Festival"
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-sm text-muted-foreground">Start Date</label>
                          <input
                            type="date"
                            value={formEventStart}
                            onChange={(e) => setFormEventStart(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-muted-foreground">End Date</label>
                          <input
                            type="date"
                            value={formEventEnd}
                            onChange={(e) => setFormEventEnd(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </fieldset>

                {/* ── Adjustment Fields ───────────────────────────────── */}
                <fieldset className="rounded-lg border border-border p-4">
                  <legend className="px-1 text-sm font-medium text-foreground">Adjustment</legend>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {/* Direction */}
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Direction</label>
                        <Select
                          options={[
                            { value: 'increase', label: 'Increase' },
                            { value: 'decrease', label: 'Decrease' },
                          ]}
                          value={formAdjDirection}
                          onChange={(v) => setFormAdjDirection(v as AdjustmentDirection)}
                          className="w-full"
                        />
                      </div>
                      {/* Type */}
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Type</label>
                        <Select
                          options={[
                            { value: 'percentage', label: 'Percentage' },
                            { value: 'fixed', label: 'Fixed ($)' },
                          ]}
                          value={formAdjType}
                          onChange={(v) => setFormAdjType(v as AdjustmentType)}
                          className="w-full"
                        />
                      </div>
                      {/* Amount */}
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                          Amount {formAdjType === 'percentage' ? '(%)' : '($)'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step={formAdjType === 'percentage' ? '1' : '0.01'}
                          value={formAdjAmount}
                          onChange={(e) => setFormAdjAmount(e.target.value)}
                          placeholder={formAdjType === 'percentage' ? 'e.g. 15' : 'e.g. 20.00'}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Floor / Ceiling */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Floor ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formFloor}
                          onChange={(e) => setFormFloor(e.target.value)}
                          placeholder="Min rate"
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Ceiling ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formCeiling}
                          onChange={(e) => setFormCeiling(e.target.value)}
                          placeholder="Max rate"
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>

              {/* Dialog Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-200/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting
                    ? 'Saving...'
                    : dialogMode === 'create'
                      ? 'Create Rule'
                      : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
