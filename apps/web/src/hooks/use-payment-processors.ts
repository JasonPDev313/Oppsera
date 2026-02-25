'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────

export interface ProviderSummary {
  id: string;
  code: string;
  displayName: string;
  providerType: string;
  isActive: boolean;
  config: Record<string, unknown> | null;
  hasCredentials: boolean;
  isSandbox: boolean;
  merchantAccountCount: number;
  createdAt: string;
}

export interface CredentialInfo {
  id: string;
  providerId: string;
  locationId: string | null;
  isSandbox: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantAccountInfo {
  id: string;
  providerId: string;
  locationId: string | null;
  merchantId: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  config: Record<string, unknown> | null;
  // ── Settings (migration 0188) ──
  hsn: string | null;
  achMerchantId: string | null;
  fundingMerchantId: string | null;
  useForCardSwipe: boolean;
  readerBeep: boolean;
  isProduction: boolean;
  allowManualEntry: boolean;
  tipOnDevice: boolean;
  // ── ACH settings ──
  achEnabled: boolean;
  achDefaultSecCode: string;
  achCompanyName: string | null;
  achCompanyId: string | null;
  createdAt: string;
}

export interface TerminalAssignmentInfo {
  id: string;
  terminalId: string;
  merchantAccountId: string;
  merchantId: string;
  merchantDisplayName: string;
  isActive: boolean;
}

// ── usePaymentProviders ──────────────────────────────────────

export function usePaymentProviders() {
  const result = useQuery({
    queryKey: ['payment-providers'],
    queryFn: () =>
      apiFetch<{ data: ProviderSummary[] }>('/api/v1/settings/payment-processors').then(
        (r) => r.data,
      ),
    staleTime: 30_000,
  });

  return {
    providers: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useProviderCredentials ───────────────────────────────────

export function useProviderCredentials(providerId: string | null) {
  const result = useQuery({
    queryKey: ['provider-credentials', providerId],
    queryFn: () =>
      apiFetch<{ data: CredentialInfo[] }>(
        `/api/v1/settings/payment-processors/${providerId}/credentials`,
      ).then((r) => r.data),
    enabled: !!providerId,
    staleTime: 15_000,
  });

  return {
    credentials: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useMerchantAccounts ──────────────────────────────────────

export function useMerchantAccounts(providerId: string | null) {
  const result = useQuery({
    queryKey: ['merchant-accounts', providerId],
    queryFn: () =>
      apiFetch<{ data: MerchantAccountInfo[] }>(
        `/api/v1/settings/payment-processors/${providerId}/merchant-accounts`,
      ).then((r) => r.data),
    enabled: !!providerId,
    staleTime: 15_000,
  });

  return {
    accounts: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useTerminalAssignments ───────────────────────────────────

export function useTerminalAssignments(enabled = true) {
  const result = useQuery({
    queryKey: ['terminal-assignments'],
    queryFn: () =>
      apiFetch<{ data: TerminalAssignmentInfo[] }>(
        '/api/v1/settings/payment-processors/terminal-assignments',
      ).then((r) => r.data),
    staleTime: 30_000,
    enabled,
  });

  return {
    assignments: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── Device Assignment Types ──────────────────────────────────

export interface DeviceAssignmentInfo {
  id: string;
  terminalId: string;
  terminalName: string;
  providerId: string;
  hsn: string;
  deviceModel: string | null;
  deviceLabel: string | null;
  isActive: boolean;
  lastConnectedAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── useDeviceAssignments ─────────────────────────────────────

export function useDeviceAssignments(providerId?: string | null, enabled = true) {
  const result = useQuery({
    queryKey: ['device-assignments', providerId ?? 'all'],
    queryFn: () => {
      const url = providerId
        ? `/api/v1/settings/payment-processors/devices?providerId=${providerId}`
        : '/api/v1/settings/payment-processors/devices';
      return apiFetch<{ data: DeviceAssignmentInfo[] }>(url).then((r) => r.data);
    },
    staleTime: 30_000,
    enabled,
  });

  return {
    devices: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useDeviceAssignmentMutations ─────────────────────────────

export function useDeviceAssignmentMutations() {
  const queryClient = useQueryClient();

  const invalidateDevices = () => {
    queryClient.invalidateQueries({ queryKey: ['device-assignments'] });
  };

  const assignDevice = useMutation({
    mutationFn: (input: {
      terminalId: string;
      providerId: string;
      hsn: string;
      deviceModel?: string;
      deviceLabel?: string;
    }) =>
      apiFetch('/api/v1/settings/payment-processors/devices', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateDevices(),
  });

  const updateDevice = useMutation({
    mutationFn: (input: {
      id: string;
      hsn?: string;
      deviceModel?: string | null;
      deviceLabel?: string | null;
      isActive?: boolean;
    }) =>
      apiFetch(`/api/v1/settings/payment-processors/devices/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateDevices(),
  });

  const removeDevice = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/settings/payment-processors/devices/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateDevices(),
  });

  return { assignDevice, updateDevice, removeDevice };
}

// ── Surcharge Settings Types ─────────────────────────────────

export interface SurchargeSettingsInfo {
  id: string;
  providerId: string;
  locationId: string | null;
  terminalId: string | null;
  isEnabled: boolean;
  surchargeRate: string;
  maxSurchargeRate: string;
  applyToCreditOnly: boolean;
  exemptDebit: boolean;
  exemptPrepaid: boolean;
  customerDisclosureText: string | null;
  receiptDisclosureText: string | null;
  prohibitedStates: string[];
  glAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── useSurchargeSettings ─────────────────────────────────────

export function useSurchargeSettings(providerId?: string | null, enabled = true) {
  const result = useQuery({
    queryKey: ['surcharge-settings', providerId ?? 'all'],
    queryFn: () => {
      const url = providerId
        ? `/api/v1/settings/payment-processors/surcharge?providerId=${providerId}`
        : '/api/v1/settings/payment-processors/surcharge';
      return apiFetch<{ data: SurchargeSettingsInfo[] }>(url).then((r) => r.data);
    },
    staleTime: 30_000,
    enabled,
  });

  return {
    settings: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSurchargeMutations ────────────────────────────────────

export function useSurchargeMutations() {
  const queryClient = useQueryClient();

  const invalidateSurcharge = () => {
    queryClient.invalidateQueries({ queryKey: ['surcharge-settings'] });
  };

  const saveSurcharge = useMutation({
    mutationFn: (input: {
      providerId: string;
      locationId?: string | null;
      terminalId?: string | null;
      isEnabled: boolean;
      surchargeRate: number;
      maxSurchargeRate: number;
      applyToCreditOnly?: boolean;
      exemptDebit?: boolean;
      exemptPrepaid?: boolean;
      customerDisclosureText?: string;
      receiptDisclosureText?: string;
      prohibitedStates?: string[];
      glAccountId?: string | null;
    }) =>
      apiFetch('/api/v1/settings/payment-processors/surcharge', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateSurcharge(),
  });

  const deleteSurcharge = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/settings/payment-processors/surcharge/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateSurcharge(),
  });

  return { saveSurcharge, deleteSurcharge };
}

// ── Merchant Account Setup Types ─────────────────────────────

export interface MerchantAccountSetupData {
  account: {
    id: string;
    providerId: string;
    locationId: string | null;
    merchantId: string;
    displayName: string;
    isDefault: boolean;
    isActive: boolean;
    hsn: string;
    achMerchantId: string;
    achEnabled: boolean;
    achDefaultSecCode: string;
    achCompanyName: string;
    achCompanyId: string;
    fundingMerchantId: string;
    useForCardSwipe: boolean;
    readerBeep: boolean;
    isProduction: boolean;
    allowManualEntry: boolean;
    tipOnDevice: boolean;
  };
  credentials: {
    site: string | null;
    username: string | null;
    password: string | null;
    authorizationKey: string | null;
    achUsername: string | null;
    achPassword: string | null;
    fundingUsername: string | null;
    fundingPassword: string | null;
  };
  credentialId: string | null;
  isSandbox: boolean;
}

// ── useMerchantAccountSetup ─────────────────────────────────

export function useMerchantAccountSetup(providerId: string | null, accountId: string | null) {
  const queryClient = useQueryClient();

  const result = useQuery({
    queryKey: ['merchant-account-setup', providerId, accountId],
    queryFn: () =>
      apiFetch<{ data: MerchantAccountSetupData }>(
        `/api/v1/settings/payment-processors/${providerId}/merchant-accounts/${accountId}/setup`,
      ).then((r) => r.data),
    enabled: !!providerId && !!accountId,
    staleTime: 15_000,
  });

  const saveMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch(
        `/api/v1/settings/payment-processors/${providerId}/merchant-accounts/${accountId}/setup`,
        {
          method: 'PUT',
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-account-setup', providerId, accountId] });
      queryClient.invalidateQueries({ queryKey: ['merchant-accounts', providerId] });
      queryClient.invalidateQueries({ queryKey: ['provider-credentials', providerId] });
    },
  });

  return {
    setup: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    save: saveMutation.mutate,
    saveAsync: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
    refetch: result.refetch,
  };
}

// ── Verify Credentials ──────────────────────────────────────

export interface VerifyCredentialRow {
  merchantAccountId: string;
  displayName: string;
  merchantId: string;
  accountType: 'Ecom' | 'ACH' | 'Funding';
  mid: string;
  username: string;
  password: string;
  status: 'OK' | 'Unauthorized' | 'Timeout' | 'Error' | 'Blank Credentials';
  error?: string;
}

export interface VerifyCredentialsResult {
  rows: VerifyCredentialRow[];
  testedAt: string;
}

export function useVerifyCredentials(providerId: string | null) {
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ data: VerifyCredentialsResult }>(
        `/api/v1/settings/payment-processors/${providerId}/verify-credentials`,
        { method: 'POST' },
      ).then((r) => r.data),
  });

  return {
    verify: mutation.mutate,
    verifyAsync: mutation.mutateAsync,
    isVerifying: mutation.isPending,
    result: mutation.data ?? null,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// ── usePaymentProcessorMutations ─────────────────────────────

export function usePaymentProcessorMutations() {
  const queryClient = useQueryClient();

  const invalidateProviders = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
  };

  const invalidateCredentials = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
    queryClient.invalidateQueries({ queryKey: ['provider-credentials'] });
  };

  const invalidateMids = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
    queryClient.invalidateQueries({ queryKey: ['merchant-accounts'] });
  };

  const invalidateTerminals = () => {
    queryClient.invalidateQueries({ queryKey: ['terminal-assignments'] });
  };

  const createProvider = useMutation({
    mutationFn: (input: { code: string; displayName: string; providerType?: string; config?: Record<string, unknown> }) =>
      apiFetch('/api/v1/settings/payment-processors', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateProviders(),
  });

  const updateProvider = useMutation({
    mutationFn: (input: { providerId: string; displayName?: string; isActive?: boolean; config?: Record<string, unknown> }) =>
      apiFetch(`/api/v1/settings/payment-processors/${input.providerId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateProviders(),
  });

  const saveCredentials = useMutation({
    mutationFn: (input: {
      providerId: string;
      locationId?: string;
      credentials: { site: string; username: string; password: string };
      isSandbox?: boolean;
    }) =>
      apiFetch(`/api/v1/settings/payment-processors/${input.providerId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateCredentials(),
  });

  const testConnection = useMutation({
    mutationFn: (input: {
      providerId: string;
      credentials?: { site: string; username: string; password: string };
      isSandbox?: boolean;
    }) =>
      apiFetch<{ data: { success: boolean; message: string } }>(
        `/api/v1/settings/payment-processors/${input.providerId}/test-connection`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ).then((r) => r.data),
  });

  const createMerchantAccount = useMutation({
    mutationFn: (input: {
      providerId: string;
      locationId?: string;
      merchantId: string;
      displayName: string;
      isDefault?: boolean;
      config?: Record<string, unknown>;
    }) =>
      apiFetch(`/api/v1/settings/payment-processors/${input.providerId}/merchant-accounts`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateMids(),
  });

  const updateMerchantAccount = useMutation({
    mutationFn: (input: {
      providerId: string;
      accountId: string;
      displayName?: string;
      isDefault?: boolean;
      isActive?: boolean;
      config?: Record<string, unknown>;
    }) =>
      apiFetch(
        `/api/v1/settings/payment-processors/${input.providerId}/merchant-accounts/${input.accountId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => invalidateMids(),
  });

  const deleteMerchantAccount = useMutation({
    mutationFn: (input: { providerId: string; accountId: string }) =>
      apiFetch(
        `/api/v1/settings/payment-processors/${input.providerId}/merchant-accounts/${input.accountId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => invalidateMids(),
  });

  const assignTerminal = useMutation({
    mutationFn: (input: { terminalId: string; merchantAccountId: string }) =>
      apiFetch('/api/v1/settings/payment-processors/terminal-assignments', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateTerminals(),
  });

  return {
    createProvider,
    updateProvider,
    saveCredentials,
    testConnection,
    createMerchantAccount,
    updateMerchantAccount,
    deleteMerchantAccount,
    assignTerminal,
  };
}
