'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerConsent } from '@/types/customers';

interface ProfileComplianceTabProps {
  customerId: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatConsentType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ProfileComplianceTab({ customerId }: ProfileComplianceTabProps) {
  const { toast } = useToast();
  const [consents, setConsents] = useState<CustomerConsent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: CustomerConsent[] }>(
        `/api/v1/customers/${customerId}/consents`,
      );
      setConsents(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load consents'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleConsent = async (consent: CustomerConsent) => {
    const newStatus = consent.status === 'granted' ? 'revoked' : 'granted';
    try {
      await apiFetch(`/api/v1/customers/${customerId}/consents/${consent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(
        newStatus === 'granted' ? 'Consent granted' : 'Consent revoked',
      );
      fetchData();
    } catch {
      toast.error('Failed to update consent');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading compliance data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">Failed to load compliance data.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Try again
        </button>
      </div>
    );
  }

  if (consents.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Shield}
          title="No consent records"
          description="No consent or compliance records found for this customer."
        />
      </div>
    );
  }

  // Separate granted and revoked
  const granted = consents.filter((c) => c.status === 'granted');
  const revoked = consents.filter((c) => c.status === 'revoked');

  return (
    <div className="space-y-6 p-6">
      {/* Summary */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Consent Summary
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-center">
            <p className="text-2xl font-semibold text-green-500">{granted.length}</p>
            <p className="text-xs text-green-500">Consents Granted</p>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center">
            <p className="text-2xl font-semibold text-red-500">{revoked.length}</p>
            <p className="text-xs text-red-500">Consents Revoked</p>
          </div>
        </div>
      </section>

      {/* Consent Records */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          All Consent Records
        </h3>
        <div className="space-y-2">
          {consents.map((consent) => {
            const isGranted = consent.status === 'granted';
            return (
              <div
                key={consent.id}
                className={`rounded-lg border p-3 ${
                  isGranted
                    ? 'border-green-500/30 bg-green-500/10'
                    : 'border-red-500/30 bg-red-500/10'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    {isGranted ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    )}
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          isGranted ? 'text-green-900' : 'text-red-900'
                        }`}
                      >
                        {formatConsentType(consent.consentType)}
                      </p>
                      <div className="mt-1 space-y-0.5 text-xs">
                        <p className={isGranted ? 'text-green-500' : 'text-red-500'}>
                          {isGranted
                            ? `Granted on ${formatDate(consent.grantedAt)}`
                            : `Revoked on ${consent.revokedAt ? formatDate(consent.revokedAt) : 'N/A'}`}
                        </p>
                        <p className={isGranted ? 'text-green-500' : 'text-red-500'}>
                          Source: {consent.source}
                        </p>
                        {isGranted && consent.grantedAt && (
                          <p className="text-green-500">
                            Originally granted: {formatDate(consent.grantedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={isGranted ? 'success' : 'error'}>
                      {consent.status}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => handleToggleConsent(consent)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        isGranted
                          ? 'text-red-500 hover:bg-red-500/100/20'
                          : 'text-green-500 hover:bg-green-500/20'
                      }`}
                    >
                      {isGranted ? 'Revoke' : 'Grant'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Privacy notice */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs text-amber-500">
          Consent changes are logged and auditable. Ensure all consent modifications
          comply with your organization&apos;s privacy policies and applicable
          regulations.
        </p>
      </div>
    </div>
  );
}
