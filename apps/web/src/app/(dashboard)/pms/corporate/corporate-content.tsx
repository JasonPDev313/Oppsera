'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Plus,
  Search,
  DollarSign,
  X,
  Loader2,
  Pencil,
  CreditCard,
  Banknote,
  Wallet,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface RatePlan {
  id: string;
  code: string;
  name: string;
}

interface CorporateAccount {
  id: string;
  propertyId: string | null;
  companyName: string;
  taxId: string | null;
  billingAddress: Record<string, unknown> | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultRatePlanId: string | null;
  negotiatedDiscountPercent: number | null;
  billingType: 'direct_bill' | 'credit_card' | 'prepaid';
  paymentTermsDays: number | null;
  creditLimitCents: number | null;
  arAccountStatus: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatCents(cents: number | null): string {
  if (cents == null) return '\u2014';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BILLING_TYPE_BADGE: Record<string, { label: string; variant: string; icon: typeof CreditCard }> = {
  direct_bill: { label: 'Direct Bill', variant: 'info', icon: Banknote },
  credit_card: { label: 'Credit Card', variant: 'success', icon: CreditCard },
  prepaid: { label: 'Prepaid', variant: 'warning', icon: Wallet },
};

const BILLING_TYPE_OPTIONS = [
  { value: 'direct_bill', label: 'Direct Bill' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'prepaid', label: 'Prepaid' },
];

// ── Form State ───────────────────────────────────────────────────

interface FormState {
  companyName: string;
  taxId: string;
  billingAddress: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  defaultRatePlanId: string;
  negotiatedDiscountPercent: string;
  billingType: string;
  paymentTermsDays: string;
  creditLimit: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  companyName: '',
  taxId: '',
  billingAddress: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  defaultRatePlanId: '',
  negotiatedDiscountPercent: '',
  billingType: 'direct_bill',
  paymentTermsDays: '30',
  creditLimit: '',
  notes: '',
};

function accountToForm(a: CorporateAccount): FormState {
  return {
    companyName: a.companyName,
    taxId: a.taxId ?? '',
    billingAddress: a.billingAddress ? JSON.stringify(a.billingAddress, null, 2) : '',
    contactName: a.contactName ?? '',
    contactEmail: a.contactEmail ?? '',
    contactPhone: a.contactPhone ?? '',
    defaultRatePlanId: a.defaultRatePlanId ?? '',
    negotiatedDiscountPercent: a.negotiatedDiscountPercent != null ? String(a.negotiatedDiscountPercent) : '',
    billingType: a.billingType,
    paymentTermsDays: a.paymentTermsDays != null ? String(a.paymentTermsDays) : '',
    creditLimit: a.creditLimitCents != null ? (a.creditLimitCents / 100).toFixed(2) : '',
    notes: a.notes ?? '',
  };
}

// ── Component ────────────────────────────────────────────────────

export default function CorporateContent() {
  useAuthContext();

  // ── Property selection ──────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');

  // ── Search ──────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Active filter ───────────────────────────────────────────────
  const [showActive, setShowActive] = useState(true);

  // ── Data ────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // ── Dialog ──────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CorporateAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Rate plans for dialog ───────────────────────────────────────
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);

  // ── Load properties ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>('/api/v1/pms/properties');
        if (cancelled) return;
        const items = res.data ?? [];
        setProperties(items);
        // Don't auto-select — null = cross-property
      } catch {
        if (!cancelled) setError('Failed to load properties');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Debounced search ────────────────────────────────────────────
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
    }, 300);
  }, []);

  // ── Fetch accounts ──────────────────────────────────────────────
  const fetchAccounts = useCallback(async (append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const qs = buildQueryString({
        propertyId: selectedPropertyId || undefined,
        search: searchTerm || undefined,
        isActive: showActive,
        cursor: append ? cursor : undefined,
        limit: 20,
      });

      const res = await apiFetch<{
        data: CorporateAccount[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/corporate-accounts${qs}`);

      const items = res.data ?? [];
      if (append) {
        setAccounts((prev) => [...prev, ...items]);
      } else {
        setAccounts(items);
      }
      setCursor(res.meta?.cursor ?? null);
      setHasMore(res.meta?.hasMore ?? false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Failed to load corporate accounts');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPropertyId, searchTerm, showActive, cursor]);

  // Re-fetch on filter change
  useEffect(() => {
    setCursor(null);
    setHasMore(false);
    fetchAccounts(false);
  }, [selectedPropertyId, searchTerm, showActive]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchAccounts(true);
    }
  }, [hasMore, isLoading, fetchAccounts]);

  // ── Load rate plans when dialog opens ───────────────────────────
  useEffect(() => {
    if (!dialogOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const propId = editingAccount?.propertyId ?? selectedPropertyId;
        const qs = propId ? buildQueryString({ propertyId: propId, limit: 100 }) : '?limit=100';
        const res = await apiFetch<{ data: RatePlan[] }>(`/api/v1/pms/rate-plans${qs}`);
        if (!cancelled) setRatePlans(res.data ?? []);
      } catch {
        if (!cancelled) setRatePlans([]);
      }
    })();
    return () => { cancelled = true; };
  }, [dialogOpen, editingAccount, selectedPropertyId]);

  // ── Dialog handlers ─────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditingAccount(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((account: CorporateAccount) => {
    setEditingAccount(account);
    setForm(accountToForm(account));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingAccount(null);
    setFormError(null);
  }, []);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    if (!form.companyName.trim()) {
      setFormError('Company name is required');
      return;
    }

    // Parse billing address JSON
    let billingAddress: Record<string, unknown> | undefined;
    if (form.billingAddress.trim()) {
      try {
        billingAddress = JSON.parse(form.billingAddress.trim());
      } catch {
        setFormError('Billing address must be valid JSON');
        return;
      }
    }

    setIsSubmitting(true);

    const payload: Record<string, unknown> = {
      companyName: form.companyName.trim(),
      taxId: form.taxId.trim() || undefined,
      billingAddress: billingAddress ?? undefined,
      contactName: form.contactName.trim() || undefined,
      contactEmail: form.contactEmail.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      defaultRatePlanId: form.defaultRatePlanId || undefined,
      billingType: form.billingType,
      paymentTermsDays: form.paymentTermsDays ? parseInt(form.paymentTermsDays, 10) : undefined,
      notes: form.notes.trim() || undefined,
    };

    if (form.negotiatedDiscountPercent) {
      payload.negotiatedDiscountPercent = parseFloat(form.negotiatedDiscountPercent);
    }
    if (form.creditLimit) {
      payload.creditLimitCents = Math.round(parseFloat(form.creditLimit) * 100);
    }

    if (!editingAccount) {
      payload.propertyId = selectedPropertyId || undefined;
    }

    try {
      if (editingAccount) {
        await apiFetch(`/api/v1/pms/corporate-accounts/${editingAccount.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/v1/pms/corporate-accounts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      closeDialog();
      fetchAccounts(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save corporate account';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, editingAccount, selectedPropertyId, closeDialog, fetchAccounts]);

  // ── Property dropdown options ───────────────────────────────────
  const propertyOptions = useMemo(
    () => [
      { value: '', label: 'All Properties' },
      ...properties.map((p) => ({ value: p.id, label: p.name })),
    ],
    [properties],
  );

  // ── Input class ─────────────────────────────────────────────────
  const inputCls =
    'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const labelCls = 'mb-1 block text-sm font-medium text-foreground';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Corporate Accounts</h1>
            <p className="text-sm text-muted-foreground">Manage corporate billing and discount accounts</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {properties.length > 1 && (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {propertyOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by company name..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setShowActive(true)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              showActive
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:bg-gray-200/50'
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setShowActive(false)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              !showActive
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:bg-gray-200/50'
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-surface">
              <th className="border-b border-border px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Company
              </th>
              <th className="border-b border-border px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Contact
              </th>
              <th className="border-b border-border px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Billing Type
              </th>
              <th className="border-b border-border px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Discount %
              </th>
              <th className="border-b border-border px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                Credit Limit
              </th>
              <th className="border-b border-border px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                AR Status
              </th>
              <th className="border-b border-border px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">
                Active
              </th>
              <th className="border-b border-border px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-12" />
            </tr>
          </thead>
          <tbody>
            {!isLoading && accounts.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <div className="flex flex-col items-center text-muted-foreground">
                    <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">No corporate accounts</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {searchTerm ? 'No accounts match your search.' : 'Create your first corporate account to get started.'}
                    </p>
                    {!searchTerm && (
                      <button
                        type="button"
                        onClick={openCreate}
                        className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                      >
                        <Plus className="h-4 w-4" />
                        Add Account
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {accounts.map((a) => {
              const bt = BILLING_TYPE_BADGE[a.billingType] ?? { label: a.billingType, variant: 'neutral', icon: DollarSign };
              const BtIcon = bt.icon;
              return (
                <tr
                  key={a.id}
                  className="transition-colors hover:bg-gray-200/30"
                >
                  <td className="border-b border-border px-4 py-3">
                    <span className="text-sm font-medium text-foreground">{a.companyName}</span>
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    {a.contactName ? (
                      <div>
                        <span className="text-sm text-foreground">{a.contactName}</span>
                        {a.contactEmail && (
                          <span className="ml-2 text-xs text-muted-foreground">{a.contactEmail}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">{'\u2014'}</span>
                    )}
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    <Badge variant={bt.variant}>
                      <BtIcon className="mr-1 h-3 w-3" />
                      {bt.label}
                    </Badge>
                  </td>
                  <td className="border-b border-border px-4 py-3 text-right">
                    <span className="text-sm text-foreground">
                      {a.negotiatedDiscountPercent != null ? `${a.negotiatedDiscountPercent}%` : '\u2014'}
                    </span>
                  </td>
                  <td className="border-b border-border px-4 py-3 text-right">
                    <span className="text-sm text-foreground">{formatCents(a.creditLimitCents)}</span>
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    {a.arAccountStatus ? (
                      <Badge variant={a.arAccountStatus === 'current' ? 'success' : a.arAccountStatus === 'overdue' ? 'error' : 'neutral'}>
                        {a.arAccountStatus}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">{'\u2014'}</span>
                    )}
                  </td>
                  <td className="border-b border-border px-4 py-3 text-center">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        a.isActive ? 'bg-green-500' : 'bg-muted-foreground/50'
                      }`}
                      title={a.isActive ? 'Active' : 'Inactive'}
                    />
                  </td>
                  <td className="border-b border-border px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(a);
                      }}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-gray-200/50 hover:text-muted-foreground"
                      title="Edit account"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-gray-200/50"
          >
            Load more
          </button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      {dialogOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeDialog}
            />
            {/* Panel */}
            <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  {editingAccount ? 'Edit Corporate Account' : 'New Corporate Account'}
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
                {/* Company Name */}
                <div>
                  <label className={labelCls}>
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => updateField('companyName', e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    maxLength={200}
                    className={inputCls}
                    autoFocus
                  />
                </div>

                {/* Tax ID */}
                <div>
                  <label className={labelCls}>Tax ID</label>
                  <input
                    type="text"
                    value={form.taxId}
                    onChange={(e) => updateField('taxId', e.target.value)}
                    placeholder="e.g. 12-3456789"
                    maxLength={50}
                    className={inputCls}
                  />
                </div>

                {/* Billing Address (JSON) */}
                <div>
                  <label className={labelCls}>Billing Address (JSON)</label>
                  <textarea
                    value={form.billingAddress}
                    onChange={(e) => updateField('billingAddress', e.target.value)}
                    placeholder={'{\n  "line1": "123 Main St",\n  "city": "Springfield",\n  "state": "IL",\n  "zip": "62701"\n}'}
                    rows={4}
                    className={`${inputCls} resize-y font-mono text-xs`}
                  />
                </div>

                {/* Contact section */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Contact Name</label>
                    <input
                      type="text"
                      value={form.contactName}
                      onChange={(e) => updateField('contactName', e.target.value)}
                      placeholder="John Smith"
                      maxLength={100}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Contact Email</label>
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => updateField('contactEmail', e.target.value)}
                      placeholder="john@acme.com"
                      maxLength={200}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Contact Phone</label>
                  <input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => updateField('contactPhone', e.target.value)}
                    placeholder="(555) 123-4567"
                    maxLength={30}
                    className={inputCls}
                  />
                </div>

                {/* Default Rate Plan */}
                <div>
                  <label className={labelCls}>Default Rate Plan</label>
                  <select
                    value={form.defaultRatePlanId}
                    onChange={(e) => updateField('defaultRatePlanId', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">None</option>
                    {ratePlans.map((rp) => (
                      <option key={rp.id} value={rp.id}>
                        {rp.name} ({rp.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Financial section */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Negotiated Discount %</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.negotiatedDiscountPercent}
                      onChange={(e) => updateField('negotiatedDiscountPercent', e.target.value)}
                      placeholder="e.g. 15"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Credit Limit ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.creditLimit}
                      onChange={(e) => updateField('creditLimit', e.target.value)}
                      placeholder="e.g. 50000.00"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Billing Type</label>
                    <select
                      value={form.billingType}
                      onChange={(e) => updateField('billingType', e.target.value)}
                      className={inputCls}
                    >
                      {BILLING_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Payment Terms (days)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.paymentTermsDays}
                      onChange={(e) => updateField('paymentTermsDays', e.target.value)}
                      placeholder="e.g. 30"
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Internal notes about this corporate account..."
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                </div>
              </div>

              {/* Actions */}
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
                    ? (editingAccount ? 'Saving...' : 'Creating...')
                    : (editingAccount ? 'Save Changes' : 'Create Account')
                  }
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
