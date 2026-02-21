'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { AccountingSettings, MappingCoverage } from '@/types/accounting';

export interface SetupStep {
  key: string;
  label: string;
  isComplete: boolean;
  href: string;
}

export interface AccountingSetupStatus {
  isBootstrapped: boolean;
  isComplete: boolean;
  steps: SetupStep[];
  overallPercentage: number;
}

export function useAccountingSetupStatus() {
  const { data: settings } = useQuery({
    queryKey: ['accounting-settings-check'],
    queryFn: () =>
      apiFetch<{ data: AccountingSettings }>('/api/v1/accounting/settings')
        .then((r) => r.data)
        .catch(() => null),
    staleTime: 60_000,
  });

  const { data: coverage } = useQuery({
    queryKey: ['mapping-coverage-check'],
    queryFn: () =>
      apiFetch<{ data: MappingCoverage }>('/api/v1/accounting/mappings/coverage')
        .then((r) => r.data)
        .catch(() => null),
    staleTime: 60_000,
  });

  const { data: bankCount } = useQuery({
    queryKey: ['bank-count-check'],
    queryFn: () =>
      apiFetch<{ data: { id: string }[] }>('/api/v1/accounting/bank-accounts')
        .then((r) => r.data.length)
        .catch(() => 0),
    staleTime: 60_000,
  });

  const isBootstrapped = !!settings;

  const steps: SetupStep[] = [
    {
      key: 'bootstrap',
      label: 'Bootstrap Chart of Accounts',
      isComplete: isBootstrapped,
      href: '/accounting/accounts',
    },
    {
      key: 'control_accounts',
      label: 'Configure Control Accounts',
      isComplete: !!(
        settings?.defaultAPControlAccountId &&
        settings?.defaultARControlAccountId &&
        settings?.defaultRetainedEarningsAccountId
      ),
      href: '/accounting/settings',
    },
    {
      key: 'mappings',
      label: 'Set Up GL Mappings',
      isComplete: (coverage?.overallPercentage ?? 0) >= 80,
      href: '/accounting/mappings',
    },
    {
      key: 'bank_accounts',
      label: 'Register Bank Accounts',
      isComplete: (bankCount ?? 0) > 0,
      href: '/accounting/banks',
    },
    {
      key: 'pos_posting',
      label: 'Enable POS Posting',
      isComplete: settings?.autoPostMode === 'auto_post',
      href: '/accounting/settings',
    },
  ];

  const completedCount = steps.filter((s) => s.isComplete).length;
  const overallPercentage = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return {
    isBootstrapped,
    isComplete: completedCount === steps.length,
    steps,
    overallPercentage,
  } as AccountingSetupStatus;
}
