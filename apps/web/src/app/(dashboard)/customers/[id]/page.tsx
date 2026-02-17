'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Building2,
  Calendar,
  DollarSign,
  Eye,
  Clock,
  Edit3,
  Plus,
  CreditCard,
  FileText,
  Activity,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/toast';
import { useCustomer, useMembershipPlans } from '@/hooks/use-customers';
import { apiFetch } from '@/lib/api-client';
import type {
  CustomerDetail,
  CustomerIdentifier,
  CustomerActivity,
  CustomerMembershipSummary,
  BillingAccountSummary,
  MembershipPlan,
} from '@/types/customers';

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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_VARIANTS: Record<string, string> = {
  active: 'success',
  pending: 'info',
  paused: 'warning',
  canceled: 'error',
  expired: 'neutral',
  suspended: 'warning',
  closed: 'neutral',
};

function statusBadgeVariant(status: string): string {
  return STATUS_VARIANTS[status] || 'neutral';
}

const ACTIVITY_TYPE_VARIANTS: Record<string, string> = {
  visit: 'indigo',
  purchase: 'success',
  note: 'info',
  membership_enrolled: 'purple',
  membership_canceled: 'error',
  identifier_added: 'orange',
  identifier_removed: 'warning',
  profile_updated: 'neutral',
};

const IDENTIFIER_TYPE_LABELS: Record<string, string> = {
  member_number: 'Member Number',
  card: 'Card',
  barcode: 'Barcode',
  qr: 'QR Code',
  wristband: 'Wristband',
  external: 'External',
};

// ── Edit Customer Dialog ──────────────────────────────────────────

interface EditFormData {
  firstName: string;
  lastName: string;
  organizationName: string;
  email: string;
  phone: string;
  notes: string;
  tags: string;
  marketingConsent: boolean;
  taxExempt: boolean;
}

function EditCustomerDialog({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerDetail;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<EditFormData>({
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    organizationName: customer.organizationName || '',
    email: customer.email || '',
    phone: customer.phone || '',
    notes: customer.notes || '',
    tags: customer.tags.join(', '),
    marketingConsent: customer.marketingConsent,
    taxExempt: customer.taxExempt,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null,
        marketingConsent: form.marketingConsent,
        taxExempt: form.taxExempt,
        tags: form.tags
          ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
      };
      if (customer.type === 'person') {
        body.firstName = form.firstName || null;
        body.lastName = form.lastName || null;
      } else {
        body.organizationName = form.organizationName || null;
      }
      await apiFetch(`/api/v1/customers/${customer.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      toast.success('Customer updated');
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update customer');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Edit Customer</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {customer.type === 'person' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">First Name</label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Organization Name
              </label>
              <input
                type="text"
                value={form.organizationName}
                onChange={(e) => setForm((f) => ({ ...f, organizationName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Tags <span className="font-normal text-gray-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.marketingConsent}
                onChange={(e) => setForm((f) => ({ ...f, marketingConsent: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Marketing consent
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.taxExempt}
                onChange={(e) => setForm((f) => ({ ...f, taxExempt: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Tax exempt
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── Add Identifier Dialog ─────────────────────────────────────────

function AddIdentifierDialog({
  open,
  onClose,
  customerId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState('member_number');
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    setType('member_number');
    setValue('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/customers/${customerId}/identifiers`, {
        method: 'POST',
        body: JSON.stringify({ type, value: value.trim() }),
      });
      toast.success('Identifier added');
      handleClose();
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add identifier');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Add Identifier</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="member_number">Member Number</option>
              <option value="card">Card</option>
              <option value="barcode">Barcode</option>
              <option value="qr">QR Code</option>
              <option value="wristband">Wristband</option>
              <option value="external">External</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Value</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter identifier value"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add Identifier'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── Add Note Dialog ───────────────────────────────────────────────

function AddNoteDialog({
  open,
  onClose,
  customerId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    setTitle('');
    setDetails('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/customers/${customerId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), details: details.trim() || null }),
      });
      toast.success('Note added');
      handleClose();
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Add Note</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Details</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              placeholder="Optional details..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── Enroll Membership Dialog ──────────────────────────────────────

function EnrollMembershipDialog({
  open,
  onClose,
  customerId,
  onEnrolled,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  onEnrolled: () => void;
}) {
  const { toast } = useToast();
  const { data: plans, isLoading: plansLoading } = useMembershipPlans({ isActive: true });
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    setSelectedPlanId('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/customers/${customerId}/memberships`, {
        method: 'POST',
        body: JSON.stringify({ planId: selectedPlanId }),
      });
      toast.success('Membership enrolled');
      handleClose();
      onEnrolled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enroll membership');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Enroll in Membership</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Membership Plan
            </label>
            {plansLoading ? (
              <div className="flex items-center gap-2 py-2">
                <LoadingSpinner size="sm" />
                <span className="text-sm text-gray-500">Loading plans...</span>
              </div>
            ) : plans.length === 0 ? (
              <p className="py-2 text-sm text-gray-500">
                No active membership plans available.
              </p>
            ) : (
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Select a plan...</option>
                {plans.map((plan: MembershipPlan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {formatMoney(plan.priceCents)}/{plan.billingInterval}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !selectedPlanId}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? 'Enrolling...' : 'Enroll'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── Overview Tab ──────────────────────────────────────────────────

function OverviewSection({
  customer,
  onAddIdentifier,
  onAddNote,
}: {
  customer: CustomerDetail;
  onAddIdentifier: () => void;
  onAddNote: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Customer Info */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Customer Info
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {customer.type === 'person' && (
            <>
              <div>
                <dt className="text-xs font-medium text-gray-500">First Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{customer.firstName || '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Last Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{customer.lastName || '\u2014'}</dd>
              </div>
            </>
          )}
          {customer.type === 'organization' && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">Organization Name</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {customer.organizationName || '\u2014'}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium text-gray-500">Email</dt>
            <dd className="mt-1 text-sm text-gray-900">{customer.email || '\u2014'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Phone</dt>
            <dd className="mt-1 text-sm text-gray-900">{customer.phone || '\u2014'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Marketing Consent</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {customer.marketingConsent ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Tax Exempt</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {customer.taxExempt ? (
                <span>
                  Yes
                  {customer.taxExemptCertificateNumber && (
                    <span className="ml-1 text-gray-500">
                      ({customer.taxExemptCertificateNumber})
                    </span>
                  )}
                </span>
              ) : (
                'No'
              )}
            </dd>
          </div>
          {customer.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">Notes</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{customer.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Identifiers */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Identifiers
          </h3>
          <button
            type="button"
            onClick={onAddIdentifier}
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Identifier
          </button>
        </div>
        {customer.identifiers.length === 0 ? (
          <p className="text-sm text-gray-500">No identifiers assigned.</p>
        ) : (
          <div className="space-y-2">
            {customer.identifiers.map((ident: CustomerIdentifier) => (
              <div
                key={ident.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {IDENTIFIER_TYPE_LABELS[ident.type] || ident.type}
                  </span>
                  <span className="ml-3 text-sm text-gray-600">{ident.value}</span>
                </div>
                <Badge variant={ident.isActive ? 'success' : 'neutral'}>
                  {ident.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Tags
        </h3>
        {customer.tags.length === 0 ? (
          <p className="text-sm text-gray-500">No tags assigned.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {customer.tags.map((tag) => (
              <Badge key={tag} variant="indigo">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Add Note Button */}
      <div className="flex">
        <button
          type="button"
          onClick={onAddNote}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <FileText className="h-4 w-4" />
          Add Note
        </button>
      </div>
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────

function ActivitySection({ activities }: { activities: CustomerActivity[] }) {
  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-surface py-12 text-center">
        <Activity className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity: CustomerActivity) => {
        const variant = ACTIVITY_TYPE_VARIANTS[activity.activityType] || 'neutral';
        return (
          <div
            key={activity.id}
            className="rounded-lg border border-gray-200 bg-surface px-5 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant={variant}>{activity.activityType.replace(/_/g, ' ')}</Badge>
                  <span className="text-sm font-medium text-gray-900">{activity.title}</span>
                </div>
                {activity.details && (
                  <p className="mt-1 text-sm text-gray-600">{activity.details}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {formatDateTime(activity.createdAt)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Memberships Tab ───────────────────────────────────────────────

function MembershipsSection({
  memberships,
  onEnroll,
}: {
  memberships: CustomerMembershipSummary[];
  onEnroll: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Memberships
        </h3>
        <button
          type="button"
          onClick={onEnroll}
          className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Enroll
        </button>
      </div>

      {memberships.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-surface py-12 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No memberships.</p>
          <button
            type="button"
            onClick={onEnroll}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Enroll in a Plan
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {memberships.map((m: CustomerMembershipSummary) => (
            <div
              key={m.id}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-900">{m.planName}</span>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span>Started {formatDate(m.startDate)}</span>
                    {m.endDate && <span>Ends {formatDate(m.endDate)}</span>}
                    {m.renewalDate && <span>Renews {formatDate(m.renewalDate)}</span>}
                  </div>
                </div>
                <Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────

function BillingSection({ billingAccounts }: { billingAccounts: BillingAccountSummary[] }) {
  const router = useRouter();

  if (billingAccounts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-surface py-12 text-center">
        <DollarSign className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">No billing accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {billingAccounts.map((acct: BillingAccountSummary) => (
        <div
          key={acct.id}
          onClick={() => router.push(`/customers/billing/${acct.id}`)}
          className="cursor-pointer rounded-lg border border-gray-200 bg-surface px-5 py-4 transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-900">{acct.name}</span>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                <span>Balance: {formatMoney(acct.currentBalanceCents)}</span>
                {acct.creditLimitCents !== null && (
                  <span>Credit limit: {formatMoney(acct.creditLimitCents)}</span>
                )}
              </div>
            </div>
            <Badge variant={statusBadgeVariant(acct.status)}>{acct.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────

type Tab = 'overview' | 'activity' | 'memberships' | 'billing';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
  { key: 'memberships', label: 'Memberships' },
  { key: 'billing', label: 'Billing' },
];

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const { data: customer, isLoading, mutate } = useCustomer(customerId);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showAddIdentifier, setShowAddIdentifier] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);

  const handleMutate = useCallback(() => {
    mutate();
  }, [mutate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
          <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="space-y-4 rounded-lg border border-gray-200 bg-surface p-6">
          <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-surface p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
              <div className="mt-2 h-6 w-16 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Not found state
  if (!customer) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/customers')}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customers
        </button>
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-16">
          <User className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">Customer not found</h3>
          <p className="mt-1 text-sm text-gray-500">
            The customer you are looking for does not exist or has been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/customers')}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Go to Customers
          </button>
        </div>
      </div>
    );
  }

  const typeBadge = customer.type === 'organization'
    ? { label: 'Organization', variant: 'purple', Icon: Building2 }
    : { label: 'Person', variant: 'info', Icon: User };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push('/customers')}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </button>

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{customer.displayName}</h1>
              <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
              {customer.taxExempt && <Badge variant="warning">Tax Exempt</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
              {customer.email && <span>{customer.email}</span>}
              {customer.phone && <span>{customer.phone}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Eye className="h-4 w-4" />
            Total Visits
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{customer.totalVisits}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <DollarSign className="h-4 w-4" />
            Total Spend
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {formatMoney(customer.totalSpend)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Clock className="h-4 w-4" />
            Last Visit
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {customer.lastVisitAt ? formatDate(customer.lastVisitAt) : '\u2014'}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Calendar className="h-4 w-4" />
            Member Since
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            {formatDate(customer.createdAt)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.key === 'activity' && customer.activities.length > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {customer.activities.length}
                </span>
              )}
              {tab.key === 'memberships' && customer.memberships.length > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {customer.memberships.length}
                </span>
              )}
              {tab.key === 'billing' && customer.billingAccounts.length > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {customer.billingAccounts.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewSection
          customer={customer}
          onAddIdentifier={() => setShowAddIdentifier(true)}
          onAddNote={() => setShowAddNote(true)}
        />
      )}
      {activeTab === 'activity' && <ActivitySection activities={customer.activities} />}
      {activeTab === 'memberships' && (
        <MembershipsSection
          memberships={customer.memberships}
          onEnroll={() => setShowEnroll(true)}
        />
      )}
      {activeTab === 'billing' && <BillingSection billingAccounts={customer.billingAccounts} />}

      {/* Dialogs */}
      <EditCustomerDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        customer={customer}
        onSaved={handleMutate}
      />
      <AddIdentifierDialog
        open={showAddIdentifier}
        onClose={() => setShowAddIdentifier(false)}
        customerId={customerId}
        onAdded={handleMutate}
      />
      <AddNoteDialog
        open={showAddNote}
        onClose={() => setShowAddNote(false)}
        customerId={customerId}
        onAdded={handleMutate}
      />
      <EnrollMembershipDialog
        open={showEnroll}
        onClose={() => setShowEnroll(false)}
        customerId={customerId}
        onEnrolled={handleMutate}
      />
    </div>
  );
}
