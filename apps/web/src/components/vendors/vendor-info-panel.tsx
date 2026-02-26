'use client';

import { Mail, Phone, Globe, MapPin, FileText } from 'lucide-react';
import type { VendorDetail } from '@/types/vendors';

export function VendorInfoPanel({ vendor }: { vendor: VendorDetail }) {
  const address = [
    vendor.addressLine1,
    vendor.addressLine2,
    [vendor.city, vendor.state].filter(Boolean).join(', '),
    vendor.postalCode,
    vendor.country,
  ].filter(Boolean).join('\n');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Contact Info */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Contact Information</h3>
        <dl className="space-y-3">
          {vendor.contactName && (
            <InfoRow label="Contact" value={vendor.contactName} />
          )}
          {vendor.contactEmail && (
            <InfoRow
              label="Email"
              icon={<Mail className="h-4 w-4 text-muted-foreground" />}
              value={
                <a href={`mailto:${vendor.contactEmail}`} className="text-indigo-600 hover:underline">
                  {vendor.contactEmail}
                </a>
              }
            />
          )}
          {vendor.contactPhone && (
            <InfoRow
              label="Phone"
              icon={<Phone className="h-4 w-4 text-muted-foreground" />}
              value={vendor.contactPhone}
            />
          )}
          {vendor.website && (
            <InfoRow
              label="Website"
              icon={<Globe className="h-4 w-4 text-muted-foreground" />}
              value={
                <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {vendor.website.replace(/^https?:\/\//, '')}
                </a>
              }
            />
          )}
          {!vendor.contactName && !vendor.contactEmail && !vendor.contactPhone && !vendor.website && (
            <p className="text-sm text-muted-foreground">No contact information</p>
          )}
        </dl>
      </div>

      {/* Business Details */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Business Details</h3>
        <dl className="space-y-3">
          {vendor.accountNumber && (
            <InfoRow label="Account #" value={vendor.accountNumber} />
          )}
          {vendor.taxId && (
            <InfoRow label="Tax ID" value={vendor.taxId} />
          )}
          {(vendor.paymentTerms || vendor.defaultPaymentTerms) && (
            <InfoRow label="Payment Terms" value={vendor.paymentTerms ?? vendor.defaultPaymentTerms!} />
          )}
          {address && (
            <InfoRow
              label="Address"
              icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
              value={<span className="whitespace-pre-line">{address}</span>}
            />
          )}
          {!vendor.accountNumber && !vendor.taxId && !vendor.paymentTerms && !address && (
            <p className="text-sm text-muted-foreground">No business details</p>
          )}
        </dl>
      </div>

      {/* Notes */}
      {vendor.notes && (
        <div className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{vendor.notes}</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
      </div>
    </div>
  );
}
