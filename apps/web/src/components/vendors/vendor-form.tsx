'use client';

import { useState } from 'react';
import type { VendorDetail, VendorFormInput } from '@/types/vendors';

interface VendorFormProps {
  vendor?: VendorDetail | null;
  onSubmit: (input: VendorFormInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function VendorForm({ vendor, onSubmit, onCancel, isSubmitting = false }: VendorFormProps) {
  const [form, setForm] = useState<VendorFormInput>({
    name: vendor?.name ?? '',
    accountNumber: vendor?.accountNumber ?? '',
    contactName: vendor?.contactName ?? '',
    contactEmail: vendor?.contactEmail ?? '',
    contactPhone: vendor?.contactPhone ?? '',
    paymentTerms: vendor?.paymentTerms ?? '',
    addressLine1: vendor?.addressLine1 ?? '',
    addressLine2: vendor?.addressLine2 ?? '',
    city: vendor?.city ?? '',
    state: vendor?.state ?? '',
    postalCode: vendor?.postalCode ?? '',
    country: vendor?.country ?? '',
    taxId: vendor?.taxId ?? '',
    notes: vendor?.notes ?? '',
    website: vendor?.website ?? '',
    defaultPaymentTerms: vendor?.defaultPaymentTerms ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof VendorFormInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = 'Vendor name is required';
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
      newErrors.contactEmail = 'Invalid email format';
    }
    if (form.website && !/^https?:\/\/.+/.test(form.website)) {
      newErrors.website = 'URL must start with http:// or https://';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Clean empty strings to null for optional fields
    const cleaned: VendorFormInput = {
      name: form.name.trim(),
      accountNumber: form.accountNumber?.trim() || null,
      contactName: form.contactName?.trim() || null,
      contactEmail: form.contactEmail?.trim() || null,
      contactPhone: form.contactPhone?.trim() || null,
      paymentTerms: form.paymentTerms?.trim() || null,
      addressLine1: form.addressLine1?.trim() || null,
      addressLine2: form.addressLine2?.trim() || null,
      city: form.city?.trim() || null,
      state: form.state?.trim() || null,
      postalCode: form.postalCode?.trim() || null,
      country: form.country?.trim() || null,
      taxId: form.taxId?.trim() || null,
      notes: form.notes?.trim() || null,
      website: form.website?.trim() || null,
      defaultPaymentTerms: form.defaultPaymentTerms?.trim() || null,
    };
    await onSubmit(cleaned);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">Basic Information</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vendor Name" required error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={inputClass(errors.name)}
              placeholder="e.g. Sysco Foods"
            />
          </Field>
          <Field label="Account Number">
            <input
              type="text"
              value={form.accountNumber ?? ''}
              onChange={(e) => handleChange('accountNumber', e.target.value)}
              className={inputClass()}
              placeholder="Vendor account #"
            />
          </Field>
          <Field label="Tax ID">
            <input
              type="text"
              value={form.taxId ?? ''}
              onChange={(e) => handleChange('taxId', e.target.value)}
              className={inputClass()}
              placeholder="EIN / Tax ID"
            />
          </Field>
          <Field label="Payment Terms">
            <input
              type="text"
              value={form.paymentTerms ?? ''}
              onChange={(e) => handleChange('paymentTerms', e.target.value)}
              className={inputClass()}
              placeholder="e.g. Net 30"
            />
          </Field>
          <Field label="Website" error={errors.website}>
            <input
              type="text"
              value={form.website ?? ''}
              onChange={(e) => handleChange('website', e.target.value)}
              className={inputClass(errors.website)}
              placeholder="https://..."
            />
          </Field>
        </div>
      </div>

      {/* Contact */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">Contact</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact Name">
            <input
              type="text"
              value={form.contactName ?? ''}
              onChange={(e) => handleChange('contactName', e.target.value)}
              className={inputClass()}
              placeholder="Sales rep name"
            />
          </Field>
          <Field label="Email" error={errors.contactEmail}>
            <input
              type="email"
              value={form.contactEmail ?? ''}
              onChange={(e) => handleChange('contactEmail', e.target.value)}
              className={inputClass(errors.contactEmail)}
              placeholder="rep@vendor.com"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={form.contactPhone ?? ''}
              onChange={(e) => handleChange('contactPhone', e.target.value)}
              className={inputClass()}
              placeholder="(555) 123-4567"
            />
          </Field>
        </div>
      </div>

      {/* Address */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">Address</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Address Line 1">
              <input
                type="text"
                value={form.addressLine1 ?? ''}
                onChange={(e) => handleChange('addressLine1', e.target.value)}
                className={inputClass()}
                placeholder="Street address"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address Line 2">
              <input
                type="text"
                value={form.addressLine2 ?? ''}
                onChange={(e) => handleChange('addressLine2', e.target.value)}
                className={inputClass()}
                placeholder="Suite, unit, etc."
              />
            </Field>
          </div>
          <Field label="City">
            <input
              type="text"
              value={form.city ?? ''}
              onChange={(e) => handleChange('city', e.target.value)}
              className={inputClass()}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={form.state ?? ''}
              onChange={(e) => handleChange('state', e.target.value)}
              className={inputClass()}
              placeholder="e.g. CA"
            />
          </Field>
          <Field label="Postal Code">
            <input
              type="text"
              value={form.postalCode ?? ''}
              onChange={(e) => handleChange('postalCode', e.target.value)}
              className={inputClass()}
            />
          </Field>
          <Field label="Country">
            <input
              type="text"
              value={form.country ?? ''}
              onChange={(e) => handleChange('country', e.target.value)}
              className={inputClass()}
              placeholder="e.g. US"
              maxLength={2}
            />
          </Field>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Field label="Notes">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            className={inputClass() + ' min-h-[80px] resize-y'}
            rows={3}
            placeholder="Internal notes about this vendor..."
          />
        </Field>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : vendor ? 'Update Vendor' : 'Create Vendor'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </label>
  );
}

function inputClass(error?: string) {
  return `w-full rounded-lg border ${
    error ? 'border-red-500/30 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-indigo-500 focus:ring-indigo-500'
  } px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:outline-none`;
}
