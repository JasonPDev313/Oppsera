'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { CurrencyInput } from '@/components/ui/currency-input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/toast';
import { useMembershipPlans, useMembershipPlan } from '@/hooks/use-customers';
import { apiFetch } from '@/lib/api-client';
import type { MembershipPlan } from '@/types/customers';

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const INTERVAL_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  annual: 'Annual',
  none: 'None',
};

type PlanRow = MembershipPlan & Record<string, unknown>;

// ── Plan Detail Expand ────────────────────────────────────────────

function PlanDetail({ planId, onClose }: { planId: string; onClose: () => void }) {
  const { data: plan, isLoading } = useMembershipPlan(planId);

  if (isLoading) {
    return (
      <div className="border-t border-border bg-muted/50 px-6 py-4">
        <LoadingSpinner label="Loading plan details..." />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="border-t border-border bg-muted/50 px-6 py-4">
        <p className="text-sm text-muted-foreground">Plan not found</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/50 px-6 py-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
          <p className="mt-1 text-sm text-foreground">{plan.description || '\u2014'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Billing Enabled</p>
          <p className="mt-1 text-sm text-foreground">{plan.billingEnabled ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Enrollment Count</p>
          <p className="mt-1 text-sm text-foreground">{plan.enrollmentCount}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</p>
          <p className="mt-1 text-sm text-foreground">{formatDate(plan.createdAt)}</p>
        </div>
      </div>
      {plan.privileges && plan.privileges.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Privileges</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {plan.privileges.map((p, i) => (
              <Badge key={i} variant="indigo">{p.type}</Badge>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Collapse
        </button>
      </div>
    </div>
  );
}

// ── Create Plan Dialog ────────────────────────────────────────────

function CreatePlanDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [billingInterval, setBillingInterval] = useState('monthly');
  const [priceDollars, setPriceDollars] = useState<number | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setBillingInterval('monthly');
    setPriceDollars(null);
    setBillingEnabled(true);
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (priceDollars === null || priceDollars < 0) newErrors.price = 'Price is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch('/api/v1/memberships/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          billingInterval,
          priceCents: Math.round((priceDollars ?? 0) * 100),
          billingEnabled,
        }),
      });
      toast.success(`Membership plan "${name.trim()}" created`);
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create membership plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Create Membership Plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define a new membership plan for your customers.
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

          <FormField label="Billing Interval" required>
            <select
              value={billingInterval}
              onChange={(e) => setBillingInterval(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="none">None (one-time)</option>
            </select>
          </FormField>

          <FormField label="Price" required error={errors.price}>
            <CurrencyInput
              value={priceDollars}
              onChange={(val) => setPriceDollars(val)}
              placeholder="0.00"
            />
          </FormField>

          <FormField label="Billing Enabled">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={billingEnabled}
                onChange={(e) => setBillingEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              Automatically bill members on their billing cycle
            </label>
          </FormField>
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
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function MembershipPlansPage() {
  const { data: plans, isLoading, mutate: refresh } = useMembershipPlans();
  const [showCreate, setShowCreate] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

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
      key: 'billingInterval',
      header: 'Billing Interval',
      render: (row: PlanRow) => (
        <span className="text-muted-foreground">
          {INTERVAL_LABELS[row.billingInterval] || row.billingInterval}
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
      key: 'isActive',
      header: 'Status',
      render: (row: PlanRow) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'billingEnabled',
      header: 'Billing',
      render: (row: PlanRow) => (
        <Badge variant={row.billingEnabled ? 'info' : 'neutral'}>
          {row.billingEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Membership Plans</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>

      {!isLoading && plans.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No membership plans"
          description="Create a membership plan to start enrolling customers"
          action={{ label: 'Create Plan', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={plans as PlanRow[]}
          isLoading={isLoading}
          emptyMessage="No membership plans found"
          onRowClick={handleRowClick}
        />
      )}

      {/* Expanded plan detail */}
      {expandedPlanId && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <PlanDetail
            planId={expandedPlanId}
            onClose={() => setExpandedPlanId(null)}
          />
        </div>
      )}

      <CreatePlanDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={refresh}
      />
    </div>
  );
}
