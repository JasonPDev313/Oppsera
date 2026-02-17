'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Plus,
  Edit2,
  Globe,
  User,
  Heart,
  Calendar,
  Shield,
  Share2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type {
  CustomerContact,
  CustomerIdentifier,
  Customer,
  CustomerExternalId,
} from '@/types/customers';

interface ProfileIdentityTabProps {
  customerId: string;
}

interface IdentityData {
  customer: Customer;
  contacts: CustomerContact[];
  identifiers: CustomerIdentifier[];
  externalIds: CustomerExternalId[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const CONTACT_ICONS = {
  email: Mail,
  phone: Phone,
  address: MapPin,
  social_media: Share2,
} as const;

export function ProfileIdentityTab({ customerId }: ProfileIdentityTabProps) {
  const { toast } = useToast();
  const [data, setData] = useState<IdentityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: IdentityData }>(
        `/api/v1/customers/${customerId}/identity`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load identity'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading identity..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Failed to load identity data.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const { customer, contacts, identifiers, externalIds } = data;

  const emailContacts = contacts.filter((c) => c.contactType === 'email');
  const phoneContacts = contacts.filter((c) => c.contactType === 'phone');
  const addressContacts = contacts.filter((c) => c.contactType === 'address');
  const socialContacts = contacts.filter((c) => c.contactType === 'social_media');

  return (
    <div className="space-y-6 p-6">
      {/* Contact Information */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Contact Information
          </h3>
          <button
            type="button"
            onClick={() => toast.info('Add contact form coming soon')}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {contacts.length === 0 ? (
          <EmptyState title="No contacts" description="No contact information on file." />
        ) : (
          <div className="space-y-4">
            {/* Emails */}
            {emailContacts.length > 0 && (
              <ContactGroup label="Email" contacts={emailContacts} />
            )}

            {/* Phones */}
            {phoneContacts.length > 0 && (
              <ContactGroup label="Phone" contacts={phoneContacts} />
            )}

            {/* Addresses */}
            {addressContacts.length > 0 && (
              <ContactGroup label="Address" contacts={addressContacts} />
            )}

            {/* Social Media */}
            {socialContacts.length > 0 && (
              <ContactGroup label="Social Media" contacts={socialContacts} />
            )}
          </div>
        )}
      </section>

      {/* Identifiers */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Identifiers
          </h3>
          <button
            type="button"
            onClick={() => toast.info('Add identifier form coming soon')}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {identifiers.length === 0 ? (
          <p className="text-sm text-gray-500">No identifiers on file.</p>
        ) : (
          <div className="space-y-2">
            {identifiers.map((id) => (
              <div
                key={id.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{id.value}</p>
                    <p className="text-xs text-gray-500">{id.type}</p>
                  </div>
                </div>
                <Badge variant={id.isActive ? 'success' : 'neutral'}>
                  {id.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Customer Details */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Customer Details
        </h3>
        <div className="space-y-2">
          <DetailRow
            icon={User}
            label="Type"
            value={customer.type === 'person' ? 'Individual' : 'Organization'}
          />
          {!!customer.metadata?.dateOfBirth && (
            <DetailRow
              icon={Calendar}
              label="Date of Birth"
              value={formatDate(String(customer.metadata.dateOfBirth))}
            />
          )}
          {!!customer.metadata?.gender && (
            <DetailRow
              icon={User}
              label="Gender"
              value={String(customer.metadata.gender)}
            />
          )}
          {!!customer.metadata?.anniversary && (
            <DetailRow
              icon={Heart}
              label="Anniversary"
              value={formatDate(String(customer.metadata.anniversary))}
            />
          )}
          {!!customer.metadata?.preferredLanguage && (
            <DetailRow
              icon={Globe}
              label="Preferred Language"
              value={String(customer.metadata.preferredLanguage)}
            />
          )}
          {!!customer.metadata?.preferredContactMethod && (
            <DetailRow
              icon={Mail}
              label="Preferred Contact"
              value={String(customer.metadata.preferredContactMethod)}
            />
          )}
        </div>
      </section>

      {/* Emergency Contact */}
      {!!customer.metadata?.emergencyContact && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Emergency Contact
          </h3>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-900">
              {(customer.metadata.emergencyContact as Record<string, string>).name}
            </p>
            <p className="text-xs text-gray-500">
              {(customer.metadata.emergencyContact as Record<string, string>).relationship}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {(customer.metadata.emergencyContact as Record<string, string>).phone}
            </p>
          </div>
        </section>
      )}

      {/* Acquisition Info */}
      {!!customer.metadata?.acquisition && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Acquisition
          </h3>
          <div className="space-y-2">
            {(customer.metadata.acquisition as Record<string, string>).source && (
              <DetailRow
                icon={Share2}
                label="Source"
                value={(customer.metadata.acquisition as Record<string, string>).source ?? ''}
              />
            )}
            {(customer.metadata.acquisition as Record<string, string>).referralCode && (
              <DetailRow
                icon={Shield}
                label="Referral Code"
                value={
                  (customer.metadata.acquisition as Record<string, string>).referralCode ?? ''
                }
              />
            )}
            {(customer.metadata.acquisition as Record<string, string>).campaign && (
              <DetailRow
                icon={Globe}
                label="Campaign"
                value={(customer.metadata.acquisition as Record<string, string>).campaign ?? ''}
              />
            )}
          </div>
        </section>
      )}

      {/* External IDs */}
      {externalIds.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            External Integrations
          </h3>
          <div className="space-y-2">
            {externalIds.map((ext) => (
              <div
                key={ext.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{ext.provider}</p>
                  <p className="text-xs text-gray-500 font-mono">{ext.externalId}</p>
                </div>
                <p className="text-xs text-gray-400">{formatDate(ext.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// --- Internal sub-components ---

function ContactGroup({
  label,
  contacts,
}: {
  label: string;
  contacts: CustomerContact[];
}) {
  const iconKey = contacts[0]?.contactType as keyof typeof CONTACT_ICONS;
  const Icon = CONTACT_ICONS[iconKey] || Mail;

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-600">{label}</p>
      <div className="space-y-1.5">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-900">{contact.value}</p>
                {contact.label && (
                  <p className="text-xs text-gray-500">{contact.label}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {contact.isPrimary && <Badge variant="indigo">Primary</Badge>}
              {contact.isVerified ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-gray-300" />
              )}
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
