'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Users, X } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useCustomers } from '@/hooks/use-customers';
import { apiFetch } from '@/lib/api-client';
import type { Customer } from '@/types/customers';

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

const TYPE_BADGES: Record<string, { label: string; variant: string }> = {
  person: { label: 'Person', variant: 'info' },
  organization: { label: 'Organization', variant: 'purple' },
};

type CustomerRow = Customer & Record<string, unknown>;

// ── Create Customer Dialog ────────────────────────────────────────

interface CreateFormData {
  type: 'person' | 'organization';
  firstName: string;
  lastName: string;
  organizationName: string;
  email: string;
  phone: string;
  notes: string;
  tags: string;
}

const emptyForm: CreateFormData = {
  type: 'person',
  firstName: '',
  lastName: '',
  organizationName: '',
  email: '',
  phone: '',
  notes: '',
  tags: '',
};

function CreateCustomerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateFormData>({ ...emptyForm });
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    setForm({ ...emptyForm });
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null,
        tags: form.tags
          ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
      };
      if (form.type === 'person') {
        body.firstName = form.firstName || null;
        body.lastName = form.lastName || null;
      } else {
        body.organizationName = form.organizationName || null;
      }
      await apiFetch('/api/v1/customers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success('Customer created');
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Add Customer</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: 'person' }))}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  form.type === 'person'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Person
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: 'organization' }))}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  form.type === 'organization'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Organization
              </button>
            </div>
          </div>

          {/* Name Fields */}
          {form.type === 'person' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Last Name
                </label>
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

          {/* Email */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="(555) 123-4567"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Tags <span className="font-normal text-gray-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="vip, member"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Actions */}
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
              {isSaving ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: customers, isLoading, hasMore, loadMore, mutate } = useCustomers({
    search: search || undefined,
  });

  const columns = [
    {
      key: 'displayName',
      header: 'Name',
      render: (row: CustomerRow) => (
        <div>
          <div className="font-medium text-gray-900">{row.displayName}</div>
          {row.email && <div className="text-xs text-gray-500">{row.email}</div>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row: CustomerRow) => {
        const badge = TYPE_BADGES[row.type] || { label: row.type, variant: 'neutral' };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'phone',
      header: 'Contact',
      render: (row: CustomerRow) => (
        <span className="text-sm text-gray-600">{row.phone || '\u2014'}</span>
      ),
    },
    {
      key: 'totalVisits',
      header: 'Visits / Spend',
      render: (row: CustomerRow) => (
        <div>
          <span className="font-medium text-gray-900">{row.totalVisits}</span>
          <span className="mx-1 text-gray-400">/</span>
          <span className="text-gray-600">{formatMoney(row.totalSpend)}</span>
        </div>
      ),
    },
    {
      key: 'lastVisitAt',
      header: 'Last Visit',
      render: (row: CustomerRow) => (
        <span className="text-sm text-gray-600">
          {row.lastVisitAt ? formatDate(row.lastVisitAt) : '\u2014'}
        </span>
      ),
    },
    {
      key: 'tags',
      header: 'Status',
      render: (row: CustomerRow) => (
        <div className="flex flex-wrap gap-1">
          {row.taxExempt && <Badge variant="warning">Tax Exempt</Badge>}
          {row.tags.length > 0 &&
            row.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="neutral">
                {tag}
              </Badge>
            ))}
          {row.tags.length > 3 && (
            <Badge variant="neutral">+{row.tags.length - 3}</Badge>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your customer profiles, memberships, and billing
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, email, or phone..."
          className="w-full md:w-80"
        />
      </div>

      {/* Table */}
      {!isLoading && customers.length === 0 && !search ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add your first customer to start tracking visits and memberships."
          action={{ label: 'Add Customer', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={customers as CustomerRow[]}
            isLoading={isLoading}
            emptyMessage="No customers match your search"
            onRowClick={(row) => router.push(`/customers/${row.id}`)}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <CreateCustomerDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={mutate}
      />
    </div>
  );
}
