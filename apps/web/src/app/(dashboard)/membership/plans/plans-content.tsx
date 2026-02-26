'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Crown,
  Edit2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useToast } from '@/components/ui/toast';
import { useMembershipPlans } from '@/hooks/use-membership';
import { apiFetch } from '@/lib/api-client';
import type { MembershipPlanV2 } from '@/types/membership';

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
};

const PRORATION_LABELS: Record<string, string> = {
  daily: 'Daily',
  half_month: 'Half-Month',
  none: 'None',
};

type PlanRow = MembershipPlanV2 & Record<string, unknown>;

// ── Plan Dialog (Create / Edit) ──────────────────────────────────

interface PlanDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editPlan?: MembershipPlanV2 | null;
}

function PlanDialog({ open, onClose, onSuccess, editPlan }: PlanDialogProps) {
  const { toast } = useToast();
  const isEditing = !!editPlan;

  const [name, setName] = useState(editPlan?.name ?? '');
  const [description, setDescription] = useState(editPlan?.description ?? '');
  const [billingFrequency, setBillingFrequency] = useState(editPlan?.billingFrequency ?? 'monthly');
  const [prorationPolicy, setProrationPolicy] = useState(editPlan?.prorationPolicy ?? 'daily');
  const [priceDollars, setPriceDollars] = useState<number | null>(
    editPlan ? editPlan.priceCents / 100 : null,
  );
  const [duesDollars, setDuesDollars] = useState<number | null>(
    editPlan?.duesAmountCents != null ? editPlan.duesAmountCents / 100 : null,
  );
  const [minMonths, setMinMonths] = useState<string>(
    editPlan?.minMonthsCommitment != null ? String(editPlan.minMonthsCommitment) : '',
  );
  const [taxable, setTaxable] = useState(editPlan?.taxable ?? true);
  const [isActive, setIsActive] = useState(editPlan?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setBillingFrequency('monthly');
    setProrationPolicy('daily');
    setPriceDollars(null);
    setDuesDollars(null);
    setMinMonths('');
    setTaxable(true);
    setIsActive(true);
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    if (!isEditing) resetForm();
    onClose();
  }, [isEditing, resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (priceDollars === null || priceDollars < 0) newErrors.price = 'Price is required';
    if (minMonths !== '' && (isNaN(Number(minMonths)) || Number(minMonths) < 0)) {
      newErrors.minMonths = 'Must be a non-negative number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      if (isEditing && editPlan) {
        await apiFetch(`/api/v1/membership/plans/${editPlan.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            billingFrequency,
            prorationPolicy,
            priceCents: Math.round((priceDollars ?? 0) * 100),
            duesAmountCents: duesDollars != null ? Math.round(duesDollars * 100) : null,
            minMonthsCommitment: minMonths !== '' ? Number(minMonths) : null,
            taxable,
            isActive,
          }),
        });
        toast.success(`Plan "${name.trim()}" updated`);
      } else {
        await apiFetch('/api/v1/membership/plans', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            billingFrequency,
            prorationPolicy,
            priceCents: Math.round((priceDollars ?? 0) * 100),
            duesAmountCents: duesDollars != null ? Math.round(duesDollars * 100) : undefined,
            minMonthsCommitment: minMonths !== '' ? Number(minMonths) : undefined,
            taxable,
          }),
        });
        toast.success(`Plan "${name.trim()}" created`);
      }
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'create'} plan`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">
          {isEditing ? 'Edit Plan' : 'Create Membership Plan'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEditing
            ? 'Update the plan details below.'
            : 'Define a new membership plan with dues and billing settings.'}
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Name" required error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gold Membership"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the plan benefits..."
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Price (base)" required error={errors.price}>
              <CurrencyInput
                value={priceDollars}
                onChange={(val) => setPriceDollars(val)}
                placeholder="0.00"
              />
            </FormField>

            <FormField label="Dues Amount (recurring)">
              <CurrencyInput
                value={duesDollars}
                onChange={(val) => setDuesDollars(val)}
                placeholder="0.00"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Billing Frequency" required>
              <select
                value={billingFrequency}
                onChange={(e) => setBillingFrequency(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </FormField>

            <FormField label="Proration Policy">
              <select
                value={prorationPolicy}
                onChange={(e) => setProrationPolicy(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="daily">Daily</option>
                <option value="half_month">Half-Month</option>
                <option value="none">None</option>
              </select>
            </FormField>
          </div>

          <FormField label="Min. Months Commitment" error={errors.minMonths}>
            <input
              type="number"
              value={minMonths}
              onChange={(e) => setMinMonths(e.target.value)}
              min={0}
              placeholder="Optional"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <div className="flex items-center gap-6">
            <FormField label="">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={taxable}
                  onChange={(e) => setTaxable(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                />
                Taxable
              </label>
            </FormField>
            {isEditing && (
              <FormField label="">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                  />
                  Active
                </label>
              </FormField>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEditing ? 'Saving...' : 'Creating...'}
              </span>
            ) : isEditing ? (
              'Save Changes'
            ) : (
              'Create Plan'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Plan Detail Expand ────────────────────────────────────────────

function PlanDetailRow({ plan }: { plan: MembershipPlanV2 }) {
  return (
    <div className="border-t border-border bg-muted/50 px-6 py-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
          <p className="mt-1 text-sm text-foreground">{plan.description || '\u2014'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dues Amount</p>
          <p className="mt-1 text-sm text-foreground">
            {plan.duesAmountCents != null ? formatMoney(plan.duesAmountCents) : '\u2014'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Proration Policy</p>
          <p className="mt-1 text-sm text-foreground">
            {PRORATION_LABELS[plan.prorationPolicy] ?? plan.prorationPolicy}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Min. Commitment</p>
          <p className="mt-1 text-sm text-foreground">
            {plan.minMonthsCommitment != null ? `${plan.minMonthsCommitment} months` : '\u2014'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Taxable</p>
          <p className="mt-1 text-sm text-foreground">{plan.taxable ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</p>
          <p className="mt-1 text-sm text-foreground">
            {new Date(plan.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Content ─────────────────────────────────────────────────

export default function PlansContent() {
  const { plans, isLoading, mutate: refresh } = useMembershipPlans();
  const [showDialog, setShowDialog] = useState(false);
  const [editPlan, setEditPlan] = useState<MembershipPlanV2 | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const handleEdit = useCallback((plan: MembershipPlanV2) => {
    setEditPlan(plan);
    setShowDialog(true);
  }, []);

  const handleClose = useCallback(() => {
    setShowDialog(false);
    setEditPlan(null);
  }, []);

  const handleRowClick = (row: PlanRow) => {
    setExpandedPlanId((prev) => (prev === row.id ? null : row.id));
  };

  const columns = [
    {
      key: 'expand',
      header: '',
      width: '40px',
      render: (row: PlanRow) =>
        expandedPlanId === row.id ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row: PlanRow) => (
        <span className="font-medium text-foreground">{row.name}</span>
      ),
    },
    {
      key: 'billingFrequency',
      header: 'Frequency',
      render: (row: PlanRow) => (
        <span className="text-muted-foreground">
          {FREQUENCY_LABELS[row.billingFrequency] ?? row.billingFrequency}
        </span>
      ),
    },
    {
      key: 'priceCents',
      header: 'Price',
      render: (row: PlanRow) => (
        <span className="font-medium text-foreground">{formatMoney(row.priceCents)}</span>
      ),
    },
    {
      key: 'duesAmountCents',
      header: 'Dues',
      render: (row: PlanRow) => (
        <span className="text-muted-foreground">
          {row.duesAmountCents != null ? formatMoney(row.duesAmountCents) : '--'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: PlanRow) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      render: (row: PlanRow) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleEdit(row as unknown as MembershipPlanV2);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Edit plan"
        >
          <Edit2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Membership Plans</h1>
        <button
          type="button"
          onClick={() => {
            setEditPlan(null);
            setShowDialog(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>

      {!isLoading && plans.length === 0 ? (
        <EmptyState
          icon={Crown}
          title="No membership plans"
          description="Create a membership plan with dues and billing settings to start enrolling customers."
          action={{
            label: 'Create Plan',
            onClick: () => {
              setEditPlan(null);
              setShowDialog(true);
            },
          }}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={plans as PlanRow[]}
            isLoading={isLoading}
            emptyMessage="No membership plans found"
            onRowClick={handleRowClick}
          />

          {/* Expanded plan detail */}
          {expandedPlanId && (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {(() => {
                const plan = plans.find((p) => p.id === expandedPlanId);
                return plan ? <PlanDetailRow plan={plan} /> : null;
              })()}
            </div>
          )}
        </>
      )}

      <PlanDialog
        key={editPlan?.id ?? 'create'}
        open={showDialog}
        onClose={handleClose}
        onSuccess={refresh}
        editPlan={editPlan}
      />
    </div>
  );
}
