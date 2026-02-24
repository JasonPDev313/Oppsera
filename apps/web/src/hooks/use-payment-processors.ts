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

export function useTerminalAssignments() {
  const result = useQuery({
    queryKey: ['terminal-assignments'],
    queryFn: () =>
      apiFetch<{ data: TerminalAssignmentInfo[] }>(
        '/api/v1/settings/payment-processors/terminal-assignments',
      ).then((r) => r.data),
    staleTime: 30_000,
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

export function useDeviceAssignments(providerId?: string | null) {
  const result = useQuery({
    queryKey: ['device-assignments', providerId ?? 'all'],
    queryFn: () => {
      const url = providerId
        ? `/api/v1/settings/payment-processors/devices?providerId=${providerId}`
        : '/api/v1/settings/payment-processors/devices';
      return apiFetch<{ data: DeviceAssignmentInfo[] }>(url).then((r) => r.data);
    },
    staleTime: 30_000,
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

export function useSurchargeSettings(providerId?: string | null) {
  const result = useQuery({
    queryKey: ['surcharge-settings', providerId ?? 'all'],
    queryFn: () => {
      const url = providerId
        ? `/api/v1/settings/payment-processors/surcharge?providerId=${providerId}`
        : '/api/v1/settings/payment-processors/surcharge';
      return apiFetch<{ data: SurchargeSettingsInfo[] }>(url).then((r) => r.data);
    },
    staleTime: 30_000,
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

// ── usePaymentProcessorMutations ─────────────────────────────

export function usePaymentProcessorMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
    queryClient.invalidateQueries({ queryKey: ['provider-credentials'] });
    queryClient.invalidateQueries({ queryKey: ['merchant-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['terminal-assignments'] });
  };

  const createProvider = useMutation({
    mutationFn: (input: { code: string; displayName: string; providerType?: string; config?: Record<string, unknown> }) =>
      apiFetch('/api/v1/settings/payment-processors', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateAll(),
  });

  const updateProvider = useMutation({
    mutationFn: (input: { providerId: string; displayName?: string; isActive?: boolean; config?: Record<string, unknown> }) =>
      apiFetch(`/api/v1/settings/payment-processors/${input.providerId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateAll(),
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
    onSuccess: () => invalidateAll(),
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
    onSuccess: () => invalidateAll(),
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
    onSuccess: () => invalidateAll(),
  });

  const deleteMerchantAccount = useMutation({
    mutationFn: (input: { providerId: string; accountId: string }) =>
      apiFetch(
        `/api/v1/settings/payment-processors/${input.providerId}/merchant-accounts/${input.accountId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => invalidateAll(),
  });

  const assignTerminal = useMutation({
    mutationFn: (input: { terminalId: string; merchantAccountId: string }) =>
      apiFetch('/api/v1/settings/payment-processors/terminal-assignments', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateAll(),
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
